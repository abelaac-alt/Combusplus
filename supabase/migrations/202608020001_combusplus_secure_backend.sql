create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.stations (
  station_id text primary key,
  name text not null,
  brand text,
  address text,
  city text,
  province text,
  postal_code text,
  latitude double precision not null,
  longitude double precision not null,
  schedule text,
  is_open boolean,
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists stations_latitude_idx on private.stations(latitude);
create index if not exists stations_longitude_idx on private.stations(longitude);
create index if not exists stations_last_seen_idx on private.stations(last_seen_at desc);

create table if not exists private.station_latest_prices (
  station_id text not null references private.stations(station_id) on delete cascade,
  fuel_key text not null,
  price numeric(8,4) not null check (price > 0 and price < 10),
  previous_price numeric(8,4),
  change numeric(8,4) generated always as (price - coalesce(previous_price, price)) stored,
  observed_at timestamptz not null default now(),
  primary key (station_id, fuel_key)
);

create index if not exists latest_prices_fuel_price_idx on private.station_latest_prices(fuel_key, price);

create table if not exists private.station_price_history (
  id bigint generated always as identity primary key,
  station_id text not null references private.stations(station_id) on delete cascade,
  fuel_key text not null,
  price numeric(8,4) not null check (price > 0 and price < 10),
  observed_at timestamptz not null default now()
);

create index if not exists price_history_station_fuel_time_idx
  on private.station_price_history(station_id, fuel_key, observed_at desc);

create table if not exists private.api_rate_limits (
  bucket_key text primary key,
  request_count integer not null default 0,
  expires_at timestamptz not null
);

alter table private.stations enable row level security;
alter table private.station_latest_prices enable row level security;
alter table private.station_price_history enable row level security;
alter table private.api_rate_limits enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

create or replace function private.store_station_batch(
  p_stations jsonb,
  p_observed_at timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  item jsonb;
  fuel record;
  prior private.station_latest_prices%rowtype;
  inserted_count integer := 0;
begin
  if jsonb_typeof(p_stations) <> 'array' then
    raise exception 'p_stations must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_stations)
  loop
    if nullif(item->>'id', '') is null
       or nullif(item->>'latitude', '') is null
       or nullif(item->>'longitude', '') is null then
      continue;
    end if;

    insert into private.stations (
      station_id, name, brand, address, city, province, postal_code,
      latitude, longitude, schedule, is_open, source_updated_at, last_seen_at, raw
    ) values (
      item->>'id', coalesce(nullif(item->>'name',''), 'Estación de servicio'),
      item->>'brand', item->>'address', item->>'city', item->>'province', item->>'postalCode',
      (item->>'latitude')::double precision, (item->>'longitude')::double precision,
      item->>'schedule', nullif(item->>'isOpen','')::boolean,
      nullif(item->>'sourceUpdatedAt','')::timestamptz, p_observed_at, coalesce(item->'raw','{}'::jsonb)
    )
    on conflict (station_id) do update set
      name = excluded.name,
      brand = excluded.brand,
      address = excluded.address,
      city = excluded.city,
      province = excluded.province,
      postal_code = excluded.postal_code,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      schedule = excluded.schedule,
      is_open = excluded.is_open,
      source_updated_at = excluded.source_updated_at,
      last_seen_at = excluded.last_seen_at,
      raw = excluded.raw;

    for fuel in select key, value from jsonb_each_text(coalesce(item->'prices','{}'::jsonb))
    loop
      if fuel.value::numeric <= 0 or fuel.value::numeric >= 10 then
        continue;
      end if;

      select * into prior
      from private.station_latest_prices
      where station_id = item->>'id' and fuel_key = fuel.key;

      if prior.station_id is null
         or abs(prior.price - fuel.value::numeric) >= 0.0005
         or prior.observed_at < p_observed_at - interval '1 hour' then
        insert into private.station_price_history(station_id, fuel_key, price, observed_at)
        values (item->>'id', fuel.key, fuel.value::numeric, p_observed_at);
      end if;

      insert into private.station_latest_prices(station_id, fuel_key, price, previous_price, observed_at)
      values (item->>'id', fuel.key, fuel.value::numeric, prior.price, p_observed_at)
      on conflict (station_id, fuel_key) do update set
        previous_price = case
          when private.station_latest_prices.price is distinct from excluded.price
            then private.station_latest_prices.price
          else private.station_latest_prices.previous_price
        end,
        price = excluded.price,
        observed_at = excluded.observed_at;
    end loop;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function private.check_rate_limit(
  p_key text,
  p_limit integer default 90,
  p_window_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  now_ts timestamptz := clock_timestamp();
  bucket text := encode(extensions.digest(
    p_key || ':' || floor(extract(epoch from now_ts) / p_window_seconds)::text,
    'sha256'
  ), 'hex');
  current_count integer;
begin
  delete from private.api_rate_limits where expires_at < now_ts;

  insert into private.api_rate_limits(bucket_key, request_count, expires_at)
  values (bucket, 1, now_ts + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update
    set request_count = private.api_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

-- Las Edge Functions usan estos RPC públicos. Solo service_role puede ejecutarlos.
create or replace function public.combusplus_store_station_batch(
  p_stations jsonb,
  p_observed_at timestamptz default now()
) returns integer
language sql
security definer
set search_path = private, public, extensions
as $$
  select private.store_station_batch(p_stations, p_observed_at);
$$;

create or replace function public.combusplus_check_rate_limit(
  p_key text,
  p_limit integer default 90,
  p_window_seconds integer default 60
) returns boolean
language sql
security definer
set search_path = private, public, extensions
as $$
  select private.check_rate_limit(p_key, p_limit, p_window_seconds);
$$;

create or replace function public.combusplus_nearby_snapshot(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision,
  p_limit integer default 250
) returns jsonb
language sql
stable
security definer
set search_path = private, public, extensions
as $$
  with candidates as (
    select
      s.*,
      6371.0 * 2.0 * asin(
        least(1.0, sqrt(
          power(sin(radians(s.latitude - p_latitude) / 2.0), 2) +
          cos(radians(p_latitude)) * cos(radians(s.latitude)) *
          power(sin(radians(s.longitude - p_longitude) / 2.0), 2)
        ))
      ) as distance_km
    from private.stations s
    where s.latitude between p_latitude - (p_radius_km / 111.0)
                         and p_latitude + (p_radius_km / 111.0)
      and s.longitude between p_longitude - (
        p_radius_km / greatest(20.0, 111.0 * cos(radians(p_latitude)))
      ) and p_longitude + (
        p_radius_km / greatest(20.0, 111.0 * cos(radians(p_latitude)))
      )
  ),
  ranked as (
    select *
    from candidates
    where distance_km <= p_radius_km
    order by distance_km asc, last_seen_at desc
    limit least(greatest(p_limit, 1), 250)
  ),
  grouped_prices as (
    select
      p.station_id,
      jsonb_object_agg(p.fuel_key, to_jsonb(p.price)) as prices,
      jsonb_object_agg(
        p.fuel_key,
        jsonb_build_object(
          'previousPrice', p.previous_price,
          'change', p.change,
          'observedAt', p.observed_at
        )
      ) as changes
    from private.station_latest_prices p
    join ranked r on r.station_id = p.station_id
    group by p.station_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'idEstacion', r.station_id,
        'rotulo', r.name,
        'marca', r.brand,
        'direccion', r.address,
        'localidad', r.city,
        'provincia', r.province,
        'codigoPostal', r.postal_code,
        'latitud', r.latitude,
        'longitud', r.longitude,
        'horario', r.schedule,
        'abierta', r.is_open,
        'fechaActualizacion', coalesce(r.source_updated_at, r.last_seen_at),
        'distancia', r.distance_km,
        '_changes', coalesce(gp.changes, '{}'::jsonb)
      ) || coalesce(gp.prices, '{}'::jsonb)
      order by r.distance_km asc
    ),
    '[]'::jsonb
  )
  from ranked r
  left join grouped_prices gp on gp.station_id = r.station_id;
$$;

revoke all on function private.store_station_batch(jsonb,timestamptz) from public, anon, authenticated;
revoke all on function private.check_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.combusplus_store_station_batch(jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.combusplus_check_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.combusplus_nearby_snapshot(double precision,double precision,double precision,integer) from public, anon, authenticated;

grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant all on all sequences in schema private to service_role;
grant execute on function private.store_station_batch(jsonb,timestamptz) to service_role;
grant execute on function private.check_rate_limit(text,integer,integer) to service_role;
grant execute on function public.combusplus_store_station_batch(jsonb,timestamptz) to service_role;
grant execute on function public.combusplus_check_rate_limit(text,integer,integer) to service_role;
grant execute on function public.combusplus_nearby_snapshot(double precision,double precision,double precision,integer) to service_role;

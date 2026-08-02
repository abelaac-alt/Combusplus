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
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  schedule text,
  is_open boolean,
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists stations_location_idx
  on private.stations(latitude, longitude);
create index if not exists stations_last_seen_idx
  on private.stations(last_seen_at desc);
create index if not exists stations_city_idx
  on private.stations(city);

create table if not exists private.station_latest_prices (
  station_id text not null references private.stations(station_id) on delete cascade,
  fuel_key text not null,
  price numeric(8,4) not null check (price > 0 and price < 10),
  previous_price numeric(8,4),
  change numeric(8,4) generated always as (
    price - coalesce(previous_price, price)
  ) stored,
  observed_at timestamptz not null default now(),
  primary key (station_id, fuel_key)
);

create index if not exists latest_prices_fuel_price_idx
  on private.station_latest_prices(fuel_key, price);
create index if not exists latest_prices_observed_idx
  on private.station_latest_prices(observed_at desc);

create table if not exists private.station_price_history (
  id bigint generated always as identity primary key,
  station_id text not null references private.stations(station_id) on delete cascade,
  fuel_key text not null,
  price numeric(8,4) not null check (price > 0 and price < 10),
  observed_at timestamptz not null default now()
);

create index if not exists price_history_station_fuel_time_idx
  on private.station_price_history(station_id, fuel_key, observed_at desc);
create index if not exists price_history_time_idx
  on private.station_price_history(observed_at desc);

create table if not exists private.api_rate_limits (
  bucket_key text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null
);

create index if not exists rate_limits_expiry_idx
  on private.api_rate_limits(expires_at);

create table if not exists private.sync_runs (
  id bigint generated always as identity primary key,
  source text not null default 'manual',
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  points_requested integer not null default 0,
  stations_received integer not null default 0,
  stations_stored integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists sync_runs_started_idx
  on private.sync_runs(started_at desc);

alter table private.stations enable row level security;
alter table private.station_latest_prices enable row level security;
alter table private.station_price_history enable row level security;
alter table private.api_rate_limits enable row level security;
alter table private.sync_runs enable row level security;

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
  parsed_price numeric;
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
      latitude, longitude, schedule, is_open, source_updated_at,
      last_seen_at, raw
    ) values (
      item->>'id',
      coalesce(nullif(item->>'name',''), 'Estación de servicio'),
      item->>'brand',
      item->>'address',
      item->>'city',
      item->>'province',
      item->>'postalCode',
      (item->>'latitude')::double precision,
      (item->>'longitude')::double precision,
      item->>'schedule',
      case
        when jsonb_typeof(item->'isOpen') = 'boolean' then (item->>'isOpen')::boolean
        else null
      end,
      nullif(item->>'sourceUpdatedAt','')::timestamptz,
      p_observed_at,
      coalesce(item->'raw','{}'::jsonb)
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

    for fuel in
      select key, value
      from jsonb_each_text(coalesce(item->'prices','{}'::jsonb))
    loop
      begin
        parsed_price := fuel.value::numeric;
      exception when others then
        continue;
      end;

      if parsed_price <= 0 or parsed_price >= 10 then
        continue;
      end if;

      select * into prior
      from private.station_latest_prices
      where station_id = item->>'id'
        and fuel_key = fuel.key;

      if prior.station_id is null
         or abs(prior.price - parsed_price) >= 0.0005
         or prior.observed_at < p_observed_at - interval '1 hour' then
        insert into private.station_price_history(
          station_id, fuel_key, price, observed_at
        ) values (
          item->>'id', fuel.key, parsed_price, p_observed_at
        );
      end if;

      insert into private.station_latest_prices(
        station_id, fuel_key, price, previous_price, observed_at
      ) values (
        item->>'id', fuel.key, parsed_price, prior.price, p_observed_at
      )
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
  delete from private.api_rate_limits
  where expires_at < now_ts;

  insert into private.api_rate_limits(bucket_key, request_count, expires_at)
  values (bucket, 1, now_ts + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update
    set request_count = private.api_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

create or replace function private.start_sync_run(
  p_source text,
  p_points_requested integer,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language sql
security definer
set search_path = private, public
as $$
  insert into private.sync_runs(source, points_requested, metadata)
  values (
    coalesce(nullif(p_source,''), 'manual'),
    greatest(coalesce(p_points_requested,0),0),
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning id;
$$;

create or replace function private.finish_sync_run(
  p_id bigint,
  p_status text,
  p_received integer,
  p_stored integer,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  update private.sync_runs
  set status = case when p_status in ('succeeded','failed') then p_status else 'failed' end,
      stations_received = greatest(coalesce(p_received,0),0),
      stations_stored = greatest(coalesce(p_stored,0),0),
      error_message = nullif(p_error,''),
      metadata = private.sync_runs.metadata || coalesce(p_metadata,'{}'::jsonb),
      finished_at = now()
  where id = p_id;
end;
$$;

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

create or replace function public.combusplus_start_sync_run(
  p_source text,
  p_points_requested integer,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language sql
security definer
set search_path = private, public
as $$
  select private.start_sync_run(p_source, p_points_requested, p_metadata);
$$;

create or replace function public.combusplus_finish_sync_run(
  p_id bigint,
  p_status text,
  p_received integer,
  p_stored integer,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = private, public
as $$
  select private.finish_sync_run(
    p_id, p_status, p_received, p_stored, p_error, p_metadata
  );
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

create or replace function public.combusplus_station_history(
  p_station_id text,
  p_fuel_key text,
  p_hours integer default 168,
  p_limit integer default 500
) returns jsonb
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'price', h.price,
        'observedAt', h.observed_at
      ) order by h.observed_at asc
    ),
    '[]'::jsonb
  )
  from (
    select price, observed_at
    from private.station_price_history
    where station_id = p_station_id
      and fuel_key = p_fuel_key
      and observed_at >= now() - make_interval(hours => least(greatest(p_hours,1),8760))
    order by observed_at desc
    limit least(greatest(p_limit,1),2000)
  ) h;
$$;

revoke all on function private.store_station_batch(jsonb,timestamptz) from public, anon, authenticated;
revoke all on function private.check_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function private.start_sync_run(text,integer,jsonb) from public, anon, authenticated;
revoke all on function private.finish_sync_run(bigint,text,integer,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.combusplus_store_station_batch(jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.combusplus_check_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.combusplus_start_sync_run(text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.combusplus_finish_sync_run(bigint,text,integer,integer,text,jsonb) from public, anon, authenticated;
revoke all on function public.combusplus_nearby_snapshot(double precision,double precision,double precision,integer) from public, anon, authenticated;
revoke all on function public.combusplus_station_history(text,text,integer,integer) from public, anon, authenticated;

grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant all on all sequences in schema private to service_role;
grant execute on all functions in schema private to service_role;
grant execute on function public.combusplus_store_station_batch(jsonb,timestamptz) to service_role;
grant execute on function public.combusplus_check_rate_limit(text,integer,integer) to service_role;
grant execute on function public.combusplus_start_sync_run(text,integer,jsonb) to service_role;
grant execute on function public.combusplus_finish_sync_run(bigint,text,integer,integer,text,jsonb) to service_role;
grant execute on function public.combusplus_nearby_snapshot(double precision,double precision,double precision,integer) to service_role;
grant execute on function public.combusplus_station_history(text,text,integer,integer) to service_role;

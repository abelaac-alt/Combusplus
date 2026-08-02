create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  registration text,
  fuel_key text not null,
  consumption numeric(6,2) not null check (consumption > 0 and consumption <= 100),
  tank_capacity numeric(7,2) check (tank_capacity > 0 and tank_capacity <= 500),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_user_idx on public.vehicles(user_id);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id text not null,
  station_name text not null,
  latitude double precision,
  longitude double precision,
  watch_fuel text not null default 'Diesel',
  notify_direction text not null default 'both' check (notify_direction in ('both','up','down','none')),
  minimum_change numeric(8,4) not null default 0.01 check (minimum_change >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, station_id, watch_fuel)
);

create index if not exists favorites_user_idx on public.favorites(user_id);

create table if not exists public.refuels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  station_id text,
  station_name text not null,
  fuel_key text not null,
  liters numeric(10,3) not null check (liters > 0),
  price_per_liter numeric(8,4) not null check (price_per_liter > 0),
  total_amount numeric(12,2) not null check (total_amount > 0),
  estimated_saving numeric(12,2) not null default 0,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refuels_user_time_idx on public.refuels(user_id, occurred_at desc);

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  station_match text,
  fuel_key text not null default 'all',
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value numeric(10,4) not null check (discount_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discounts_user_idx on public.discounts(user_id);

create table if not exists public.alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  default_direction text not null default 'both' check (default_direction in ('both','up','down','none')),
  default_minimum_change numeric(8,4) not null default 0.01,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web','android')),
  endpoint text not null,
  p256dh text,
  auth_secret text,
  device_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.favorites enable row level security;
alter table public.refuels enable row level security;
alter table public.discounts enable row level security;
alter table public.alert_preferences enable row level security;
alter table public.user_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

create or replace function public.current_user_owns(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null and auth.uid() = p_user_id;
$$;

revoke all on function public.current_user_owns(uuid) from public;
grant execute on function public.current_user_owns(uuid) to authenticated;

create policy profiles_owner_all on public.profiles
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy vehicles_owner_all on public.vehicles
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy favorites_owner_all on public.favorites
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy refuels_owner_all on public.refuels
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy discounts_owner_all on public.discounts
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy alert_preferences_owner_all on public.alert_preferences
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy user_preferences_owner_all on public.user_preferences
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create policy push_subscriptions_owner_all on public.push_subscriptions
  for all to authenticated
  using (public.current_user_owns(user_id))
  with check (public.current_user_owns(user_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute procedure public.set_updated_at();
create trigger favorites_set_updated_at before update on public.favorites
  for each row execute procedure public.set_updated_at();
create trigger refuels_set_updated_at before update on public.refuels
  for each row execute procedure public.set_updated_at();
create trigger discounts_set_updated_at before update on public.discounts
  for each row execute procedure public.set_updated_at();
create trigger alert_preferences_set_updated_at before update on public.alert_preferences
  for each row execute procedure public.set_updated_at();
create trigger user_preferences_set_updated_at before update on public.user_preferences
  for each row execute procedure public.set_updated_at();
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
  for each row execute procedure public.set_updated_at();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.refuels to authenticated;
grant select, insert, update, delete on public.discounts to authenticated;
grant select, insert, update, delete on public.alert_preferences to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

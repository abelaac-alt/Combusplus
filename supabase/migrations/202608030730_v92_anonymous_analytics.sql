-- Combusplus 9.2: estadísticas seudónimas con consentimiento.
create table if not exists private.analytics_events (
  id bigint generated always as identity primary key,
  installation_hash text not null,
  event_name text not null,
  page_name text,
  platform text,
  device_family text,
  app_version text,
  city_approx text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_idx
  on private.analytics_events(created_at desc);
create index if not exists analytics_events_installation_idx
  on private.analytics_events(installation_hash, created_at desc);
create index if not exists analytics_events_name_idx
  on private.analytics_events(event_name, created_at desc);

create table if not exists private.analytics_presence (
  installation_hash text primary key,
  platform text,
  device_family text,
  app_version text,
  city_approx text,
  last_seen_at timestamptz not null default now()
);

alter table private.analytics_events enable row level security;
alter table private.analytics_presence enable row level security;
revoke all on private.analytics_events from public, anon, authenticated;
revoke all on private.analytics_presence from public, anon, authenticated;

create or replace function public.combusplus_track_analytics(
  p_installation_hash text,
  p_event_name text,
  p_page_name text,
  p_platform text,
  p_device_family text,
  p_app_version text,
  p_city_approx text,
  p_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  insert into private.analytics_events(
    installation_hash,event_name,page_name,platform,device_family,app_version,city_approx,metadata
  ) values (
    p_installation_hash,
    left(coalesce(p_event_name,'unknown'),80),
    left(coalesce(p_page_name,''),40),
    left(coalesce(p_platform,''),30),
    left(coalesce(p_device_family,''),80),
    left(coalesce(p_app_version,''),30),
    left(coalesce(p_city_approx,''),80),
    coalesce(p_metadata,'{}'::jsonb)
  );

  insert into private.analytics_presence(
    installation_hash,platform,device_family,app_version,city_approx,last_seen_at
  ) values (
    p_installation_hash,
    left(coalesce(p_platform,''),30),
    left(coalesce(p_device_family,''),80),
    left(coalesce(p_app_version,''),30),
    left(coalesce(p_city_approx,''),80),
    now()
  )
  on conflict (installation_hash) do update set
    platform=excluded.platform,
    device_family=excluded.device_family,
    app_version=excluded.app_version,
    city_approx=case when excluded.city_approx='' then private.analytics_presence.city_approx else excluded.city_approx end,
    last_seen_at=now();
end;
$$;

revoke all on function public.combusplus_track_analytics(text,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.combusplus_track_analytics(text,text,text,text,text,text,text,jsonb)
  to service_role;

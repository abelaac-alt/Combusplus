-- Combusplus 8.0: sesiones anónimas, sin cuentas y sin datos personales en el servidor.

create table if not exists private.app_installations (
  installation_hash text primary key,
  platform text not null check (platform in ('web','android','android-auto','android-worker')),
  app_version text not null default 'unknown',
  integrity_level text not null default 'unknown',
  token_version integer not null default 1 check (token_version > 0),
  blocked boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_token_at timestamptz not null default now()
);

create index if not exists app_installations_last_seen_idx
  on private.app_installations(last_seen_at desc);

create table if not exists private.security_events (
  id bigint generated always as identity primary key,
  installation_hash text,
  event_type text not null,
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx
  on private.security_events(created_at desc);
create index if not exists security_events_installation_idx
  on private.security_events(installation_hash, created_at desc);

alter table private.app_installations enable row level security;
alter table private.security_events enable row level security;

revoke all on private.app_installations from public, anon, authenticated;
revoke all on private.security_events from public, anon, authenticated;

create or replace function private.register_installation(
  p_installation_hash text,
  p_platform text,
  p_app_version text,
  p_integrity_level text
) returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  row_value private.app_installations%rowtype;
begin
  if p_installation_hash is null or length(p_installation_hash) < 32 then
    raise exception 'installation hash invalid';
  end if;

  insert into private.app_installations(
    installation_hash, platform, app_version, integrity_level,
    first_seen_at, last_seen_at, last_token_at
  ) values (
    p_installation_hash,
    p_platform,
    left(coalesce(p_app_version, 'unknown'), 30),
    left(coalesce(p_integrity_level, 'unknown'), 40),
    now(), now(), now()
  )
  on conflict (installation_hash) do update set
    platform = excluded.platform,
    app_version = excluded.app_version,
    integrity_level = excluded.integrity_level,
    last_seen_at = now(),
    last_token_at = now()
  returning * into row_value;

  return jsonb_build_object(
    'allowed', not row_value.blocked,
    'tokenVersion', row_value.token_version
  );
end;
$$;

create or replace function public.combusplus_register_installation(
  p_installation_hash text,
  p_platform text,
  p_app_version text,
  p_integrity_level text
) returns jsonb
language sql
security definer
set search_path = private, public
as $$
  select private.register_installation(
    p_installation_hash,
    p_platform,
    p_app_version,
    p_integrity_level
  );
$$;

create or replace function private.log_security_event(
  p_installation_hash text,
  p_event_type text,
  p_severity text default 'info',
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = private, public
as $$
  insert into private.security_events(
    installation_hash, event_type, severity, metadata
  ) values (
    nullif(p_installation_hash, ''),
    left(coalesce(p_event_type, 'unknown'), 80),
    left(coalesce(p_severity, 'info'), 20),
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

create or replace function public.combusplus_log_security_event(
  p_installation_hash text,
  p_event_type text,
  p_severity text default 'info',
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = private, public
as $$
  select private.log_security_event(
    p_installation_hash,
    p_event_type,
    p_severity,
    p_metadata
  );
$$;

-- Combusplus 8 no usa cuentas. Se deshabilita la superficie de datos autenticados
-- creada en versiones anteriores sin eliminar tablas por seguridad de migración.
drop trigger if exists on_auth_user_created on auth.users;
revoke all on public.profiles from anon, authenticated;
revoke all on public.vehicles from anon, authenticated;
revoke all on public.favorites from anon, authenticated;
revoke all on public.refuels from anon, authenticated;
revoke all on public.discounts from anon, authenticated;
revoke all on public.alert_preferences from anon, authenticated;
revoke all on public.user_preferences from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.combusplus_cleanup_operational_data(
  p_history_retention_days integer default 730,
  p_sync_retention_days integer default 90
) returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  history_deleted bigint := 0;
  sync_deleted bigint := 0;
  rate_deleted bigint := 0;
  security_deleted bigint := 0;
  installations_deleted bigint := 0;
begin
  delete from private.station_price_history
  where observed_at < now() - make_interval(days => greatest(30, p_history_retention_days));
  get diagnostics history_deleted = row_count;

  delete from private.sync_runs
  where started_at < now() - make_interval(days => greatest(7, p_sync_retention_days));
  get diagnostics sync_deleted = row_count;

  delete from private.api_rate_limits where expires_at < now();
  get diagnostics rate_deleted = row_count;

  delete from private.security_events
  where created_at < now() - interval '30 days';
  get diagnostics security_deleted = row_count;

  delete from private.app_installations
  where blocked = false and last_seen_at < now() - interval '180 days';
  get diagnostics installations_deleted = row_count;

  return jsonb_build_object(
    'historyDeleted', history_deleted,
    'syncDeleted', sync_deleted,
    'rateDeleted', rate_deleted,
    'securityDeleted', security_deleted,
    'installationsDeleted', installations_deleted
  );
end;
$$;

revoke all on function private.register_installation(text,text,text,text) from public, anon, authenticated;
revoke all on function private.log_security_event(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.combusplus_register_installation(text,text,text,text) from public, anon, authenticated;
revoke all on function public.combusplus_log_security_event(text,text,text,jsonb) from public, anon, authenticated;

grant execute on function public.combusplus_register_installation(text,text,text,text) to service_role;
grant execute on function public.combusplus_log_security_event(text,text,text,jsonb) to service_role;
grant execute on function public.combusplus_cleanup_operational_data(integer,integer) to service_role;

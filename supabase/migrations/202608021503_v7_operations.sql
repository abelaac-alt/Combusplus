create or replace function private.cleanup_operational_data(
  p_history_retention_days integer default 1095,
  p_sync_retention_days integer default 90
) returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  history_deleted integer;
  rate_limits_deleted integer;
  sync_deleted integer;
begin
  delete from private.station_price_history
  where observed_at < now() - make_interval(days => greatest(p_history_retention_days, 30));
  get diagnostics history_deleted = row_count;

  delete from private.api_rate_limits
  where expires_at < now();
  get diagnostics rate_limits_deleted = row_count;

  delete from private.sync_runs
  where started_at < now() - make_interval(days => greatest(p_sync_retention_days, 7));
  get diagnostics sync_deleted = row_count;

  return jsonb_build_object(
    'historyDeleted', history_deleted,
    'rateLimitsDeleted', rate_limits_deleted,
    'syncRunsDeleted', sync_deleted,
    'cleanedAt', now()
  );
end;
$$;

create or replace function public.combusplus_cleanup_operational_data(
  p_history_retention_days integer default 1095,
  p_sync_retention_days integer default 90
) returns jsonb
language sql
security definer
set search_path = private, public
as $$
  select private.cleanup_operational_data(
    p_history_retention_days,
    p_sync_retention_days
  );
$$;

revoke all on function private.cleanup_operational_data(integer,integer) from public, anon, authenticated;
revoke all on function public.combusplus_cleanup_operational_data(integer,integer) from public, anon, authenticated;
grant execute on function private.cleanup_operational_data(integer,integer) to service_role;
grant execute on function public.combusplus_cleanup_operational_data(integer,integer) to service_role;

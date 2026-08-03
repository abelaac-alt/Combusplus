-- Combusplus 9.2.1: consulta segura para el panel de administración.
create or replace function public.combusplus_admin_analytics_summary()
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'generatedAt', now(),
    'totals', jsonb_build_object(
      'installations', (select count(*) from private.analytics_presence),
      'activeNow', (select count(*) from private.analytics_presence where last_seen_at >= now() - interval '2 minutes'),
      'events24h', (select count(*) from private.analytics_events where created_at >= now() - interval '24 hours'),
      'events30d', (select count(*) from private.analytics_events where created_at >= now() - interval '30 days')
    ),
    'byPlatform', coalesce((
      select jsonb_agg(jsonb_build_array(value, total) order by total desc)
      from (
        select coalesce(nullif(platform,''), 'Sin datos') as value, count(*) as total
        from private.analytics_presence
        group by 1
      ) q
    ), '[]'::jsonb),
    'byDevice', coalesce((
      select jsonb_agg(jsonb_build_array(value, total) order by total desc)
      from (
        select coalesce(nullif(device_family,''), 'Sin datos') as value, count(*) as total
        from private.analytics_presence
        group by 1
      ) q
    ), '[]'::jsonb),
    'byCity', coalesce((
      select jsonb_agg(jsonb_build_array(value, total) order by total desc)
      from (
        select coalesce(nullif(city_approx,''), 'Sin datos') as value, count(*) as total
        from private.analytics_presence
        group by 1
      ) q
    ), '[]'::jsonb),
    'byVersion', coalesce((
      select jsonb_agg(jsonb_build_array(value, total) order by total desc)
      from (
        select coalesce(nullif(app_version,''), 'Sin datos') as value, count(*) as total
        from private.analytics_presence
        group by 1
      ) q
    ), '[]'::jsonb),
    'installations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'installation', left(installation_hash, 12),
          'platform', platform,
          'device', device_family,
          'version', app_version,
          'city', city_approx,
          'lastSeenAt', last_seen_at
        )
        order by last_seen_at desc
      )
      from (
        select *
        from private.analytics_presence
        order by last_seen_at desc
        limit 500
      ) recent
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.combusplus_admin_analytics_summary() from public, anon, authenticated;
grant execute on function public.combusplus_admin_analytics_summary() to service_role;

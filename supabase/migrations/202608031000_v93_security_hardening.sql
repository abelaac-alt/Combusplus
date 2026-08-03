-- Combusplus 9.3: refuerzo verificable de RLS y permisos.
-- La clave publicable del cliente no obtiene acceso directo a ninguna tabla.
begin;

do $$
declare
  item record;
  relation regclass;
  tables_to_harden constant text[][] := array[
    array['private','stations'],
    array['private','station_latest_prices'],
    array['private','station_price_history'],
    array['private','api_rate_limits'],
    array['private','sync_runs'],
    array['private','app_installations'],
    array['private','security_events'],
    array['private','analytics_events'],
    array['private','analytics_presence'],
    array['public','profiles'],
    array['public','vehicles'],
    array['public','favorites'],
    array['public','refuels'],
    array['public','discounts'],
    array['public','alert_preferences'],
    array['public','user_preferences'],
    array['public','push_subscriptions']
  ];
begin
  foreach item slice 1 in array tables_to_harden loop
    relation := to_regclass(format('%I.%I', item[1], item[2]));
    if relation is not null then
      execute format(
        'alter table %I.%I enable row level security',
        item[1],
        item[2]
      );
      execute format(
        'alter table %I.%I force row level security',
        item[1],
        item[2]
      );
      execute format(
        'revoke all privileges on table %I.%I from public, anon, authenticated',
        item[1],
        item[2]
      );
    end if;
  end loop;
end;
$$;

-- Las secuencias internas tampoco quedan disponibles para clientes.
revoke all privileges on all sequences in schema private
  from public, anon, authenticated;

-- Las funciones Combusplus solo se ejecutan desde Edge Functions con service_role.
do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'combusplus_%'
  loop
    execute format(
      'revoke all privileges on function %I.%I(%s) from public, anon, authenticated',
      fn.schema_name,
      fn.function_name,
      fn.arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      fn.schema_name,
      fn.function_name,
      fn.arguments
    );
  end loop;
end;
$$;

-- La migración falla si alguna tabla conocida termina sin RLS.
do $$
declare
  insecure_count integer;
begin
  select count(*)
  into insecure_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and (
      (n.nspname = 'private' and c.relname in (
        'stations','station_latest_prices','station_price_history',
        'api_rate_limits','sync_runs','app_installations',
        'security_events','analytics_events','analytics_presence'
      ))
      or
      (n.nspname = 'public' and c.relname in (
        'profiles','vehicles','favorites','refuels','discounts',
        'alert_preferences','user_preferences','push_subscriptions'
      ))
    )
    and not c.relrowsecurity;

  if insecure_count <> 0 then
    raise exception 'La auditoría RLS ha detectado % tablas sin protección', insecure_count;
  end if;
end;
$$;

commit;

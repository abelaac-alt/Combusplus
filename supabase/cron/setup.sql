-- Ejecuta este archivo una sola vez desde Supabase SQL Editor.
-- Sustituye REEMPLAZAR_SYNC_SECRET antes de ejecutarlo.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://axdgelkubdwwajgpklan.supabase.co',
  'combusplus_project_url',
  'URL del proyecto para las sincronizaciones de Combusplus'
)
where not exists (
  select 1 from vault.secrets where name = 'combusplus_project_url'
);

select vault.create_secret(
  'REEMPLAZAR_SYNC_SECRET',
  'combusplus_sync_secret',
  'Secreto del Cron de Combusplus'
)
where not exists (
  select 1 from vault.secrets where name = 'combusplus_sync_secret'
);

-- Elimina versiones anteriores para evitar trabajos duplicados.
select cron.unschedule(jobid)
from cron.job
where jobname in ('combusplus-sync-prices', 'combusplus-cleanup');

select cron.schedule(
  'combusplus-sync-prices',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'combusplus_project_url'
      limit 1
    ) || '/functions/v1/sync-stations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Combusplus-Sync', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'combusplus_sync_secret'
        limit 1
      )
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);

select cron.schedule(
  'combusplus-cleanup',
  '15 3 * * *',
  $job$
  select public.combusplus_cleanup_operational_data(1095, 90);
  $job$
);

-- Comprobación:
select jobid, jobname, schedule, active
from cron.job
where jobname in ('combusplus-sync-prices', 'combusplus-cleanup')
order by jobname;

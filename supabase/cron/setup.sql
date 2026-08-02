-- Ejecuta este archivo una vez después de desplegar las funciones.
-- Sustituye los valores y guárdalos en Vault; no los escribas en Git.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
-- select vault.create_secret('TU_CLAVE_PUBLICA', 'publishable_key');
-- select vault.create_secret('TU_SYNC_SECRET', 'combusplus_sync_secret');

select cron.schedule(
  'combusplus-sync-prices',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-stations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'X-Combusplus-Sync', (select decrypted_secret from vault.decrypted_secrets where name = 'combusplus_sync_secret')
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);

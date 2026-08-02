# Seguridad de Combusplus 7.0

## Secretos que nunca deben publicarse

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `PRECIOIL_API_KEY`
- `COMBUSPLUS_APP_ACCESS_TOKEN`
- `COMBUSPLUS_SYNC_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- firma y contraseñas de Android

## Datos públicos aceptables

- URL de las Edge Functions
- clave `sb_publishable_...` de Supabase
- clave de Google Maps restringida a los dominios autorizados

## Límites reales

La clave privada de Precioil queda oculta en Supabase. La dirección pública de una Edge Function no puede ocultarse: debe protegerse mediante validación, rate limiting, RLS, CORS y, durante la beta privada, `X-Combusplus-Token`.

Una clave de Google Maps usada por JavaScript es visible para el navegador. Debe restringirse por referente HTTP y limitarse exclusivamente a Maps JavaScript API.

## Respuesta a incidentes

1. Revoca la clave comprometida.
2. Genera una nueva.
3. Actualiza el secreto en GitHub y Supabase.
4. Ejecuta `Desplegar Supabase`.
5. Revisa los logs de Edge Functions y `private.sync_runs`.

# Configuración interna de Combusplus 7.1

La interfaz no solicita al usuario la URL de Supabase, la clave pública, códigos de acceso ni la clave de Google Maps.

## Variables públicas de GitHub Actions

- `SUPABASE_FUNCTIONS_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAP_ID` (opcional)

La clave de Google Maps es una clave pública de navegador. Debe restringirse en Google Cloud a:

- `https://abelaac-alt.github.io/Combusplus/*`
- `https://appassets.androidplatform.net/*`

Y únicamente a `Maps JavaScript API`.

## Secretos privados

Permanecen exclusivamente en Supabase/GitHub:

- `PRECIOIL_API_KEY`
- `COMBUSPLUS_SYNC_SECRET`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

Los endpoints de consulta de estaciones exponen datos públicos con CORS y limitación de peticiones. `sync-stations` continúa protegido por `SYNC_SECRET`.

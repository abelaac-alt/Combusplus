# Actualización Combusplus 7.1 — configuración interna

## Objetivo

Mantener el diseño actual y eliminar la configuración técnica visible para el usuario.

## Variables públicas de GitHub

En `Settings → Secrets and variables → Actions → Variables` crea:

- `GOOGLE_MAPS_API_KEY`: clave de navegador de Google Maps.
- `GOOGLE_MAP_ID`: opcional. Puede dejarse vacío.

Ya deben existir:

- `SUPABASE_FUNCTIONS_URL`
- `SUPABASE_PUBLISHABLE_KEY`

## Seguridad de Google Maps

La clave es pública por naturaleza en una aplicación web. Restríngela en Google Cloud:

- Aplicación: sitios web.
- Referencias autorizadas:
  - `https://abelaac-alt.github.io/Combusplus/*`
  - `https://appassets.androidplatform.net/*`
- API permitida: únicamente `Maps JavaScript API`.

## Despliegue

1. Sustituye el contenido del repositorio por esta versión.
2. Ejecuta `Desplegar Supabase`.
3. Ejecuta `Publicar web`.
4. Ejecuta `Generar APK de prueba`.
5. En la web, fuerza una recarga con `Ctrl + F5`.
6. En Android, instala la nueva APK.

## Resultado

El usuario ya no introduce:

- URL de Edge Functions.
- Clave pública de Supabase.
- Código personal de acceso.
- Clave de Google Maps.
- Map ID.

El menú Ajustes conserva únicamente las preferencias de notificaciones.

`sync-stations` sigue protegido con `SYNC_SECRET`. Los endpoints públicos de consulta de estaciones mantienen CORS, caché y limitación de solicitudes.

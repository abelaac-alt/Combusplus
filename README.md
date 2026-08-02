# Combusplus 7.0

Proyecto único para web, PWA y Android que calcula la gasolinera más rentable para un vehículo según precio, distancia, consumo y cantidad a repostar.

## Incluye

- Interfaz única en `web/` compartida por GitHub Pages y la APK.
- Diseño móvil sin desplazamiento horizontal y compatible con zonas seguras.
- Vehículos, favoritas, descuentos, repostajes y ajustes guardados localmente.
- Búsqueda por importe y búsqueda de llenado completo.
- Mapa, favoritas, evolución de precios, estadísticas y widgets Android.
- Backend Supabase con histórico de precios, caché, RLS y Edge Functions.
- Clave privada de Precioil únicamente en Supabase.
- GitHub Actions para validar, desplegar Supabase, publicar la web, generar APK y crear Releases Android.

## Estructura

```text
.github/workflows/      Automatización de GitHub
android/                Aplicación Android y widgets
supabase/               Migraciones, funciones y Cron
web/                    Interfaz compartida por web y Android
docs/INSTALLATION.md    Tutorial completo
```

## Instalación

Lee [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Seguridad

- `PRECIOIL_API_KEY`, `SUPABASE_ACCESS_TOKEN`, contraseña de base de datos y secretos internos nunca se escriben en `web/` ni en la APK.
- La clave pública de Supabase y una clave web de Google Maps son datos de cliente y deben protegerse mediante RLS, cuotas y restricciones de dominio.
- Los datos personales se guardan localmente por defecto. Las tablas de usuario incluidas en Supabase quedan preparadas para una futura sincronización autenticada y tienen RLS por propietario.

## Versiones

- Web: `7.0.0`
- Android: `versionName 7.0.0`
- Android: `versionCode 20`

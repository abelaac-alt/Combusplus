# Combusplus 9.0

Combusplus busca la gasolinera más rentable según el precio, la distancia, el consumo real del vehículo, el importe o depósito completo, los descuentos y el trayecto de ida o ida y vuelta.

## Incluido

- Web/PWA, APK y AAB Android.
- Backend Supabase con precios, histórico y cálculo en servidor.
- Uso sin registro: cada instalación funciona de forma anónima.
- Vehículos, favoritas, descuentos e historial almacenados localmente.
- Cifrado local Android con AES-256-GCM y Android Keystore.
- Sesiones anónimas firmadas, rate limiting y registro técnico de seguridad.
- Play Integrity preparado para modo `optional` y `enforce`.
- Google Maps con mapa alternativo cuando el proveedor no responde.
- Comparación entre la mejor gasolinera y una seleccionada.
- Búsqueda por importe o depósito lleno.
- Cálculo de solo ida o ida y vuelta.
- Android Auto, widgets y notificaciones de precios.
- Renovación automática de sesión desde Android Auto y WorkManager.
- Generación automática de APK de prueba y AAB release firmado.
- CodeQL y Dependabot para mantenimiento de seguridad.

## Instalación

Consulta [docs/INSTALLATION_V9.md](docs/INSTALLATION_V9.md).

## Publicación

Consulta [docs/PLAY_STORE_CHECKLIST.md](docs/PLAY_STORE_CHECKLIST.md) y [docs/GOOGLE_PLAY_LISTING_ES.md](docs/GOOGLE_PLAY_LISTING_ES.md).

## Seguridad

Consulta [docs/SECURITY_V9.md](docs/SECURITY_V9.md).

## Limitaciones reales

Ninguna aplicación puede garantizar que sea imposible de atacar o que Google Play la apruebe automáticamente. Antes de publicar deben completarse los datos legales de `web/privacy.html`, configurar Play Integrity en Play Console, probar el AAB en una pista interna y revisar la declaración de Seguridad de los datos.

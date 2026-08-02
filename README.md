# Combusplus 8.0

Aplicación web, Android y Android Auto para encontrar la gasolinera económicamente más conveniente según precio, distancia, consumo, importe o depósito completo y modalidad de trayecto.

## Principios de la versión 8

- sin registro ni cuentas;
- datos personales de uso guardados en el dispositivo;
- almacenamiento Android cifrado mediante Keystore;
- backend Supabase para precios, histórico, cálculo y seguridad;
- claves privadas fuera del cliente;
- sesiones anónimas por instalación;
- límites de uso;
- Play Integrity preparado;
- AAB de producción mediante GitHub Actions;
- Android Auto, widgets y notificaciones.

## Instalación

Consulta [docs/INSTALLATION_V8.md](docs/INSTALLATION_V8.md).

## Seguridad

Consulta [docs/SECURITY_V8.md](docs/SECURITY_V8.md).

## Publicación

Consulta [docs/PLAY_STORE_CHECKLIST.md](docs/PLAY_STORE_CHECKLIST.md).

## Importante

Antes de publicar debes incorporar los datos legales reales del responsable en `web/privacy.html`, configurar Play Console, completar Seguridad de los datos y ejecutar pruebas en dispositivos reales. Ningún código puede garantizar ausencia absoluta de vulnerabilidades ni aprobación automática por Google Play.

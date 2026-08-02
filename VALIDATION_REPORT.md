# Informe de validación · Combusplus 8.0

Fecha: 2 de agosto de 2026

## Validado en este paquete

- Sintaxis de `web/src/app.js` y `web/src/core.js`.
- Pruebas automáticas del algoritmo JavaScript.
- Estructura JSON del manifiesto PWA.
- Estructura XML del manifiesto y recursos Android.
- Sintaxis YAML de todos los workflows.
- Ausencia de claves privadas reales conocidas en el paquete.
- Coherencia de versión 8.0.0.
- Igualdad de la web fuente y la web integrada en Android.
- Configuración de target API 36, AGP 9.2 y Gradle 9.4.1.
- Backend sin registro, sesiones anónimas, rate limiting y endpoints de cálculo.

## Validaciones que requieren infraestructura externa

- Compilación final Android en GitHub Actions con Android SDK.
- Despliegue de migraciones y Edge Functions en el proyecto Supabase real.
- Veredictos reales de Play Integrity desde una instalación de Google Play.
- Firma y carga del AAB en Play Console.
- Revisión de Android Auto.
- Revisión de políticas, ficha, privacidad y Seguridad de los datos.
- Pruebas en dispositivos reales, fabricantes y versiones de Android.

El paquete reduce errores de configuración y aplica medidas de seguridad de producción, pero no puede garantizar ausencia total de vulnerabilidades ni aprobación automática de Google Play.

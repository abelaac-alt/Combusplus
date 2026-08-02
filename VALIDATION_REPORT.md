# Informe de validación · Combusplus 9.0

Fecha: 2 de agosto de 2026

## Validado localmente

- Sintaxis de `web/src/app.js` y `web/src/core.js`.
- Pruebas del algoritmo para importe, depósito lleno, solo ida, ida y vuelta y comparación.
- JSON de paquete y manifiesto PWA.
- YAML de todos los workflows.
- XML del manifiesto y recursos Android.
- IDs de la interfaz y selectores JavaScript.
- Estructura de los archivos Java modificados.
- Coherencia de versión 9.0.0 en web, backend, workflows y Android.
- Migración SQL corregida para conservar los nombres de parámetros existentes.
- Igualdad entre la web fuente y la web integrada en Android.
- Ausencia de claves privadas reales incluidas intencionadamente.
- Target API 36, versionCode 40 y versionName 9.0.0.

## Mejoras verificadas por código

- Backend integrado sin campos de configuración visibles.
- Sesión anónima con renovación web y nativa.
- Renovación automática para Android Auto y WorkManager.
- Almacenamiento Android cifrado.
- Play Integrity preparado.
- Google Maps inyectado por GitHub Actions.
- Caché PWA que no reutiliza `config.js` antiguo.
- CodeQL y Dependabot configurados.

## Requieren infraestructura externa

- Compilación Android final en GitHub Actions.
- Despliegue real de Supabase.
- Pruebas de Play Integrity desde Google Play.
- Firma y carga del AAB.
- Revisión de Android Auto.
- Datos legales y declaración de Seguridad de los datos.
- Pruebas en dispositivos físicos.

No es posible garantizar ausencia absoluta de vulnerabilidades ni aprobación automática por Google Play.

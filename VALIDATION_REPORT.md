# Informe de validación · Combusplus 10.6.3

Fecha: 8 de agosto de 2026

## Resultado

El código fuente se consolidó en la versión 10.6.3. GitHub Actions ya no
ejecuta la cadena histórica de scripts que reescribía la aplicación durante
cada compilación.

## Correcciones principales

- Se consolidaron buscador por ruta, filtros, descuentos, mapas y diseño final.
- `versionCode`, `versionName` y la configuración generada ahora respetan las
  propiedades de compilación.
- Android usa Maps nativo sin incrustar la clave de Maps JavaScript.
- Se restauró el mapa Android dentro del recuadro de la WebView.
- Se migró el gesto Atrás a `OnBackPressedDispatcher` para Android 16.
- Se corrigió una API de codificación incompatible con Android 8–12.
- Se sustituyó el recurso privado de hosts de Android Auto por una lista propia.
- Se eliminó un recurso JPEG mal etiquetado como PNG que rompía el release.
- Se rechazaron coordenadas nulas/vacías en el backend y se reforzó su
  normalización.
- Se corrigieron HTML inválido, controles sin tipo y problemas de accesibilidad.
- Se añadieron CSP y directivas antiindexación al panel administrativo.
- Se retiró una credencial administrativa que aparecía en la documentación.
- Se añadieron Gradle Wrapper, `.gitignore` y escaneo Gitleaks.

## Validaciones ejecutadas

- `npm ci` y `npm run check`.
- Pruebas de cálculo web: importe, depósito lleno, ida/vuelta, descuentos,
  rangos y enlaces de ruta.
- Validación HTML de las tres páginas.
- `deno check` sobre todas las funciones Edge y pruebas Deno del backend.
- Análisis sintáctico PostgreSQL de todas las migraciones y del cron.
- Validación YAML de todos los workflows.
- Gitleaks 8.30.1 sin secretos detectados tras retirar la credencial expuesta.
- Android Lint debug sin errores.
- Compilación real de APK debug.
- Compilación real de AAB release con R8 y reducción de recursos.
- Inspección de APK/AAB: sin panel administrativo, sin clave Web de Maps y
  con integración de mapa nativo.

## Requiere infraestructura o datos del propietario

- Rotar `COMBUSPLUS_ADMIN_TOKEN` si el valor antiguo llegó a GitHub/Supabase.
- Configurar variables y secretos indicados en `docs/INSTALLATION_V9.md`.
- Completar los datos legales de `web/privacy.html`.
- Desplegar migraciones y Edge Functions en el proyecto Supabase real.
- Compilar/firma con el keystore real y probar el AAB desde una pista interna.
- Verificar Play Integrity, Android Auto, widgets, notificaciones y ubicación
  en dispositivos físicos.

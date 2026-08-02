# Instalación de Combusplus 8.0

Combusplus 8 funciona sin cuentas de usuario. Los vehículos, favoritas, descuentos, repostajes y preferencias permanecen en el dispositivo. El backend solo mantiene precios, históricos, una huella anónima de instalación y registros técnicos de seguridad.

## 1. Sustituir el repositorio

Sube el contenido completo del proyecto a la raíz del repositorio `abelaac-alt/Combusplus`. Deben existir:

```text
.github/workflows/
android/
supabase/
web/
docs/
```

No subas claves reales dentro de archivos.

## 2. Secretos de GitHub

En **Settings → Secrets and variables → Actions → Secrets** configura:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_ID
PRECIOIL_API_KEY
COMBUSPLUS_SYNC_SECRET
COMBUSPLUS_SYNC_POINTS_JSON
COMBUSPLUS_DEVICE_TOKEN_SECRET
COMBUSPLUS_RATE_LIMIT_SALT
PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON       (después de configurar Play Integrity)
ANDROID_KEYSTORE_BASE64                   (clave de subida, no clave de firma de Google)
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

### Generar secretos compatibles con Windows PowerShell antiguo

Ejecuta dos veces este bloque y guarda cada resultado por separado:

```powershell
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
$rng.Dispose()
```

- Primer resultado: `COMBUSPLUS_DEVICE_TOKEN_SECRET`
- Segundo resultado: `COMBUSPLUS_RATE_LIMIT_SALT`

No deben coincidir con `COMBUSPLUS_SYNC_SECRET`.

## 3. Variables de GitHub

En **Settings → Secrets and variables → Actions → Variables** configura:

```text
SUPABASE_FUNCTIONS_URL=https://TU_PROYECTO.supabase.co/functions/v1
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
COMBUSPLUS_ALLOWED_ORIGINS=https://abelaac-alt.github.io,https://appassets.androidplatform.net
GOOGLE_MAPS_API_KEY=AIza...
GOOGLE_MAP_ID=
PLAY_INTEGRITY_MODE=optional
PLAY_INTEGRITY_PACKAGE_NAME=com.grupomds.combusplus
PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=NUMERO_DEL_PROYECTO_GOOGLE_CLOUD
DEVICE_TOKEN_TTL_SECONDS=604800
```

Durante las pruebas usa `PLAY_INTEGRITY_MODE=optional`. Después de publicar la aplicación en una pista de Google Play, comprobar que la validación funciona y cambiarlo a `enforce`.

## 4. Desplegar Supabase

Ejecuta:

```text
Actions → Desplegar Supabase → Run workflow
```

Este flujo:

1. aplica todas las migraciones;
2. configura secretos de Edge Functions;
3. despliega `bootstrap`, `recommend`, `compare-stations`, `stations-nearby`, `station-history`, `sync-stations` y `health`.

Comprueba:

```text
https://TU_PROYECTO.supabase.co/functions/v1/health
```

Debe responder con `ok: true` y `version: 8.0.0`.

## 5. Mantener el Cron existente

El Cron de sincronización de precios ya creado continúa siendo válido. Compruébalo en SQL Editor:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('combusplus-sync-prices', 'combusplus-cleanup')
order by jobname;
```

## 6. Publicar la web

Ejecuta:

```text
Actions → Publicar web → Run workflow
```

Después abre:

```text
https://abelaac-alt.github.io/Combusplus/
```

La política de privacidad estará en:

```text
https://abelaac-alt.github.io/Combusplus/privacy.html
```

Antes de publicar, sustituye en `web/privacy.html` el bloque del responsable por los datos legales reales de la empresa y un correo de privacidad.

## 7. Generar APK de prueba

Ejecuta:

```text
Actions → Generar APK de prueba → Run workflow
```

Descarga el artefacto `Combusplus-APK-...`. Esta APK usa un identificador `.debug` y sirve para pruebas, no para Play Store.

## 8. Crear la clave de subida de Android

En un equipo con Java instalado:

```powershell
keytool -genkeypair -v `
  -keystore combusplus-upload.jks `
  -alias combusplus-upload `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000
```

Convierte el archivo a Base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("combusplus-upload.jks")) | Set-Content -NoNewline combusplus-upload-base64.txt
```

Guarda el contenido en `ANDROID_KEYSTORE_BASE64`. Conserva el archivo `.jks` y sus contraseñas fuera de GitHub y con copia de seguridad cifrada.

## 9. Configurar Play Integrity

1. Crea o selecciona un proyecto de Google Cloud.
2. Activa **Play Integrity API**.
3. Vincula el proyecto a Combusplus en Google Play Console.
4. Crea una cuenta de servicio con acceso a Play Integrity.
5. Descarga su JSON, minifícalo a una sola línea y guárdalo en `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`.
6. Pon el número del proyecto en `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER`.
7. Vuelve a ejecutar **Desplegar Supabase**.
8. Publica primero en una pista de pruebas internas.
9. Cuando los registros indiquen `play-recognized` o `device-integrity`, cambia `PLAY_INTEGRITY_MODE` a `enforce` y despliega de nuevo.

## 10. Crear AAB de producción

Crea un tag:

```bash
git tag v8.0.0
git push origin v8.0.0
```

O ejecuta manualmente:

```text
Actions → Publicar Android (AAB y APK)
```

Descarga `Combusplus-v8.0.0.aab`. Ese es el archivo que se sube a Google Play Console. Activa **Play App Signing** y utiliza el `.jks` únicamente como clave de subida.

## 11. Publicación en Play Console

Completa como mínimo:

- ficha de la aplicación;
- icono 512 × 512;
- capturas de teléfono y Android Auto;
- clasificación de contenido;
- público objetivo;
- política de privacidad pública;
- formulario Seguridad de los datos;
- declaración de permisos de ubicación;
- ficha de Android Auto;
- correo de soporte;
- pruebas internas y cerradas.

La aprobación final depende de Google Play. Ningún proyecto puede garantizarla sin pasar la revisión real de la consola.

# Instalación de Combusplus 9.0

## 1. Subir el proyecto

Sube el contenido de la carpeta `project` a la raíz del repositorio `abelaac-alt/Combusplus`. La estructura correcta es:

```text
.github/
android/
docs/
supabase/
web/
README.md
SECURITY.md
SUPABASE_SETUP.md
```

No debe existir una carpeta adicional `project/` dentro del repositorio.

## 2. Secretos de GitHub

En `Settings → Secrets and variables → Actions → Secrets` deben existir:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
PRECIOIL_API_KEY
COMBUSPLUS_SYNC_SECRET
COMBUSPLUS_SYNC_POINTS_JSON
COMBUSPLUS_DEVICE_TOKEN_SECRET
COMBUSPLUS_RATE_LIMIT_SALT
```

Para generar los dos últimos valores en PowerShell:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 64
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Genera un valor diferente para cada secreto.

Para el AAB release añade también (consulta [KEYSTORE_SETUP.md](KEYSTORE_SETUP.md)):

```text
ANDROID_KEYSTORE_BASE64
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

Play Integrity en producción utiliza:

```text
PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON
```

## 3. Variables de GitHub

En `Actions → Variables` configura:

```text
SUPABASE_FUNCTIONS_URL=https://axdgelkubdwwajgpklan.supabase.co/functions/v1
SUPABASE_PUBLISHABLE_KEY=<clave pública de Supabase>
GOOGLE_MAPS_API_KEY=<clave web restringida>
GOOGLE_MAP_ID=<opcional>
COMBUSPLUS_ALLOWED_ORIGINS=https://abelaac-alt.github.io,https://appassets.androidplatform.net
PLAY_INTEGRITY_MODE=optional
PLAY_INTEGRITY_PACKAGE_NAME=com.grupomds.combusplus
PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=<número del proyecto de Google Cloud o 0>
DEVICE_TOKEN_TTL_SECONDS=604800
```

## 4. Orden de despliegue

Ejecuta en GitHub Actions:

```text
1. Validar proyecto
2. Desplegar Supabase
3. Publicar web
4. Generar APK de prueba
```

La URL pública es:

```text
https://abelaac-alt.github.io/Combusplus/
```

## 5. Prueba funcional

Comprueba:

- creación y edición de vehículos;
- consumo, combustible y capacidad de depósito;
- búsqueda por importe;
- búsqueda por depósito lleno;
- solo ida e ida y vuelta;
- coste del repostaje;
- comparación y ahorro;
- mapa;
- favoritas y alertas;
- widgets;
- Android Auto;
- conservación de datos después de cerrar la app.

## 6. Publicación Android

Ejecuta `Publicar Android (AAB y APK)`. El artefacto contendrá un `.aab`, un `.apk` y `SHA256SUMS.txt`. Sube el AAB primero a una pista interna de Play Console.

## 7. Activar Play Integrity

Mantén `PLAY_INTEGRITY_MODE=optional` durante las pruebas iniciales. Cuando el AAB esté instalado desde Google Play, el proyecto de Cloud esté vinculado y el backend disponga de la cuenta de servicio, cambia a:

```text
PLAY_INTEGRITY_MODE=enforce
```

Vuelve a ejecutar `Desplegar Supabase`.

# Instalación completa de Combusplus 7.0

Este tutorial parte de:

```text
Repositorio: abelaac-alt/Combusplus
Rama: main
Supabase Project ID: axdgelkubdwwajgpklan
Web: https://abelaac-alt.github.io/Combusplus/
```

## 1. Hacer una copia de seguridad

1. En GitHub abre el repositorio `Combusplus`.
2. Pulsa **Code → Download ZIP**.
3. Guarda esa copia antes de sustituir archivos.

## 2. Subir Combusplus 7.0

1. Descomprime `Combusplus-v7.0-completo.zip`.
2. Abre la carpeta `Combusplus-v7.0`.
3. Sube **el contenido interior**, no una carpeta adicional.
4. En la raíz del repositorio deben verse:

```text
.github
android
docs
supabase
web
README.md
SECURITY.md
```

La carpeta `.github` puede estar oculta en Windows, pero debe existir en GitHub.

## 3. Comprobar GitHub Secrets

Ruta:

```text
Settings → Secrets and variables → Actions → Secrets
```

Deben existir exactamente:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
PRECIOIL_API_KEY
COMBUSPLUS_APP_ACCESS_TOKEN
COMBUSPLUS_SYNC_SECRET
COMBUSPLUS_SYNC_POINTS_JSON
```

Valores:

```text
SUPABASE_PROJECT_ID = axdgelkubdwwajgpklan
COMBUSPLUS_SYNC_POINTS_JSON = [{"latitude":37.3399,"longitude":-5.8419,"radius":30}]
```

Los demás valores son privados y no deben escribirse en el repositorio.

## 4. Comprobar GitHub Variables

Ruta:

```text
Settings → Secrets and variables → Actions → Variables
```

Deben existir:

```text
COMBUSPLUS_ALLOWED_ORIGINS
SUPABASE_FUNCTIONS_URL
SUPABASE_PUBLISHABLE_KEY
```

Valores:

```text
COMBUSPLUS_ALLOWED_ORIGINS = https://abelaac-alt.github.io,https://appassets.androidplatform.net
SUPABASE_FUNCTIONS_URL = https://axdgelkubdwwajgpklan.supabase.co/functions/v1
SUPABASE_PUBLISHABLE_KEY = sb_publishable_TU_CLAVE_PUBLICA
```

## 5. Desplegar la base de datos y las Edge Functions

1. Abre **Actions**.
2. Ejecuta **Desplegar Supabase**.
3. Selecciona `main`.
4. Espera a que todos los pasos terminen en verde.

La Action:

- vincula el proyecto;
- aplica todas las migraciones SQL;
- configura los secretos de Edge Functions;
- despliega `stations-nearby`, `station-history`, `sync-stations` y `health`.

## 6. Verificar las tablas de Supabase

En **Table Editor**, abre el desplegable de esquema y selecciona `private`.

Deben aparecer:

```text
stations
station_latest_prices
station_price_history
api_rate_limits
sync_runs
```

En el esquema `public` deben aparecer las tablas preparadas para sincronización autenticada:

```text
profiles
vehicles
favorites
refuels
discounts
alert_preferences
user_preferences
push_subscriptions
```

Que las tablas de gasolineras estén en `private` es correcto y evita que la web pueda consultarlas directamente.

## 7. Verificar las Edge Functions

En Supabase entra en **Edge Functions**. Deben aparecer:

```text
stations-nearby
station-history
sync-stations
health
```

Prueba de salud desde el navegador:

```text
https://axdgelkubdwwajgpklan.supabase.co/functions/v1/health
```

La función debe devolver un JSON que incluya `ok: true`. Si la beta privada exige token, la prueba se hace desde los ajustes de Combusplus o con el encabezado `X-Combusplus-Token`.

## 8. Activar el Cron de precios

1. En Supabase abre **SQL Editor**.
2. Abre `supabase/cron/setup.sql` del repositorio.
3. Sustituye:

```text
REEMPLAZAR_SYNC_SECRET
```

por el valor de `COMBUSPLUS_SYNC_SECRET`.

4. Ejecuta el archivo una sola vez.

El trabajo `combusplus-sync-prices` se ejecutará cada 15 minutos.

Para comprobarlo:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'combusplus-sync-prices';
```

## 9. Ejecutar una sincronización inmediata

En **SQL Editor**, una vez creado el Cron, ejecuta:

```sql
select net.http_post(
  url := 'https://axdgelkubdwwajgpklan.supabase.co/functions/v1/sync-stations',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Combusplus-Sync', (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'combusplus_sync_secret'
      limit 1
    )
  ),
  body := '{"source":"manual"}'::jsonb
);
```

Espera unos segundos y comprueba:

```sql
select count(*) from private.stations;
select count(*) from private.station_latest_prices;
select count(*) from private.station_price_history;
select * from private.sync_runs order by started_at desc limit 10;
```

## 10. Publicar la web

1. En GitHub abre **Settings → Pages**.
2. Selecciona **Source: GitHub Actions**.
3. En **Actions** ejecuta **Publicar web**.
4. Abre:

```text
https://abelaac-alt.github.io/Combusplus/
```

5. En Windows fuerza una recarga con `Ctrl + F5`.

## 11. Configurar Combusplus

En la web o APK abre **Ajustes** e introduce:

```text
Servidor: https://axdgelkubdwwajgpklan.supabase.co/functions/v1
Clave pública: la variable SUPABASE_PUBLISHABLE_KEY
Token privado: el valor COMBUSPLUS_APP_ACCESS_TOKEN
```

La clave de Google Maps es opcional para el mapa. Debe restringirse a:

```text
https://abelaac-alt.github.io/Combusplus/*
https://appassets.androidplatform.net/*
```

## 12. Generar la APK de prueba

1. Abre **Actions → Generar APK de prueba**.
2. Pulsa **Run workflow**.
3. Descarga el artefacto con nombre parecido a:

```text
Combusplus-APK-42-1
```

4. Descomprime el ZIP.
5. Instala `Combusplus-v7-debug.apk`.

La Action copia la carpeta `web/` dentro de Android antes de compilar. La web y la APK usan el mismo diseño y el mismo código.

## 13. Actualizar sin perder datos

Para conservar vehículos, favoritas y repostajes:

- instala las actualizaciones encima de la aplicación anterior;
- no pulses **Borrar datos**;
- no cambies el `applicationId`;
- las versiones oficiales deben firmarse siempre con el mismo keystore.

## 14. Crear una versión Android firmada

Crea estos secretos adicionales en GitHub:

```text
ANDROID_KEYSTORE_BASE64
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

Después crea una etiqueta:

```text
v7.0.0
```

El workflow **Publicar APK Android** creará:

```text
Combusplus-v7.0.0.apk
Combusplus-v7.0.0.aab
```

## 15. Orden correcto de ejecución

```text
1. Validar proyecto
2. Desplegar Supabase
3. Ejecutar Cron / sincronización inicial
4. Publicar web
5. Generar APK de prueba
6. Crear Release firmada cuando esté validada
```

## 16. Diagnóstico rápido

### No aparecen tablas

Selecciona el esquema `private`. Si sigue vacío, abre el paso **Aplicar migraciones** en GitHub Actions.

### Error 401

Comprueba `COMBUSPLUS_APP_ACCESS_TOKEN` en GitHub, Supabase y ajustes de la aplicación.

### Error de Precioil

Rota la clave, actualiza `PRECIOIL_API_KEY` y ejecuta nuevamente **Desplegar Supabase**.

### La web muestra una versión antigua

Ejecuta **Publicar web**, espera a que termine y borra la caché del sitio.

### La APK abre un contenido incorrecto

Genera una APK nueva. El workflow valida que exista `web/index.html` antes de compilar.

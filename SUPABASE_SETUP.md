# Configuración segura de Supabase

## 1. Crear el proyecto

Crea un proyecto en Supabase y guarda:

- referencia del proyecto;
- contraseña de la base de datos;
- clave pública o `publishable key`;
- token personal de Supabase para GitHub Actions.

La clave pública se usa para identificar el proyecto desde el navegador. No concede acceso a las tablas privadas de Combusplus.

## 2. Generar los secretos de Combusplus

Genera dos valores diferentes de al menos 32 bytes:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Utiliza uno como `COMBUSPLUS_APP_ACCESS_TOKEN` y otro como `COMBUSPLUS_SYNC_SECRET`.

El primer valor se introduce una sola vez en los ajustes de la web y la APK. No se incorpora al repositorio ni al archivo `config.js`.

## 3. Secretos del repositorio GitHub

En **Settings → Secrets and variables → Actions → Secrets**, crea:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
PRECIOIL_API_KEY
COMBUSPLUS_APP_ACCESS_TOKEN
COMBUSPLUS_SYNC_SECRET
COMBUSPLUS_SYNC_POINTS_JSON
```

Ejemplo para `COMBUSPLUS_SYNC_POINTS_JSON`:

```json
[{"latitude":37.3399,"longitude":-5.8419,"radius":30}]
```

La clave `PRECIOIL_API_KEY`, la contraseña de la base de datos y `service_role` nunca deben aparecer en `web/`, en el repositorio o dentro de la APK.

## 4. Variables públicas del repositorio

En **Settings → Secrets and variables → Actions → Variables**, crea:

```text
SUPABASE_FUNCTIONS_URL=https://TU-PROYECTO.supabase.co/functions/v1
SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
COMBUSPLUS_ALLOWED_ORIGINS=https://abelaac-alt.github.io,https://appassets.androidplatform.net
```

Estas dos primeras variables se insertan en `web/config.js` durante la publicación web y la generación de la APK. Son datos públicos de conexión; la seguridad real se mantiene en las Edge Functions, RLS, `service_role` y la clave privada de Precioil almacenada como secreto.

## 5. Desplegar el backend

Ejecuta:

```text
Actions → Desplegar Supabase → Run workflow
```

El flujo:

1. vincula el proyecto;
2. aplica la migración SQL;
3. carga los secretos de las Edge Functions;
4. despliega `stations-nearby` y `sync-stations`.

## 6. Activar la actualización programada

En Supabase abre **SQL Editor**, revisa `supabase/cron/setup.sql`, sustituye los valores indicados y ejecútalo una sola vez.

El ejemplo consulta los puntos de `SYNC_POINTS_JSON` cada 15 minutos. Además, cualquier búsqueda desde la web o la APK actualiza automáticamente la zona consultada cuando la caché supera los 15 minutos.

## 7. Configurar la aplicación

Abre **Ajustes** e introduce únicamente:

```text
Token privado de Combusplus = valor de COMBUSPLUS_APP_ACCESS_TOKEN
```

La URL y la clave pública aparecerán automáticamente cuando estén definidas como variables de GitHub. También pueden escribirse manualmente si la aplicación se instala antes de configurar las variables.

## 8. Google Maps

La clave de Maps JavaScript se ejecuta en el navegador, por lo que no puede ocultarse como una clave de servidor. Debe restringirse a:

```text
https://abelaac-alt.github.io/Combusplus/*
https://appassets.androidplatform.net/*
```

Y limitarse únicamente a **Maps JavaScript API**. La clave privada de Precioil sí permanece completamente fuera del cliente.

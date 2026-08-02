# Seguridad de Combusplus

## Secretos que nunca llegan al cliente

- clave privada de Precioil;
- clave `service_role` de Supabase;
- contraseña de PostgreSQL;
- secreto usado por la sincronización programada.

Se guardan en Supabase Secrets o GitHub Actions Secrets y se utilizan únicamente en el servidor.

## Base de datos

Las tablas se encuentran en el esquema `private`, tienen RLS activado y revocan el acceso de `anon`, `authenticated` y `public`. Las Edge Functions acceden a ellas mediante funciones `SECURITY DEFINER` cuyo permiso de ejecución se concede exclusivamente a `service_role`.

## Protección del endpoint

La función pública de consulta incorpora:

- token personal de Combusplus;
- comparación del token en tiempo constante;
- limitación de solicitudes por IP y token;
- lista de orígenes web permitidos;
- límites de radio y cantidad de resultados;
- validación y normalización de precios;
- respuestas sin caché del navegador.

Un token almacenado en una aplicación cliente no puede considerarse un secreto absoluto frente al propietario del dispositivo. Su función es impedir el uso casual del endpoint. La protección de las claves realmente sensibles se consigue porque nunca se entregan al navegador ni a la APK.

## Google Maps

La clave de Maps JavaScript es necesariamente visible para el navegador. Debe restringirse por referente HTTP, por aplicación y únicamente a las APIs necesarias.

## Datos personales locales

Vehículos, matrícula, descuentos, favoritas e historial de repostajes permanecen en el dispositivo. La aplicación no los envía a Supabase. En Android se guardan en almacenamiento privado de la aplicación y en el almacenamiento del WebView.

## Android

- contenido web cargado desde `WebViewAssetLoader` con origen HTTPS local;
- acceso a archivos y contenido deshabilitado;
- contenido mixto HTTP bloqueado;
- enlaces externos abiertos fuera del WebView;
- insets del sistema aplicados de forma nativa;
- notificaciones periódicas mediante WorkManager.

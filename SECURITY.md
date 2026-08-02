# Seguridad de Combusplus

## Claves de Precioil

Una clave privada `sk_live_` no debe publicarse en GitHub, JavaScript ni dentro de una APK. Para una aplicación pública utiliza el proxy incluido y configura la clave como secreto del proveedor.

## Google Maps

La clave de Maps JavaScript API es visible para el navegador. Debe restringirse al dominio autorizado y únicamente a Maps JavaScript API.

## Datos locales

Vehículos, favoritas, descuentos e historial se guardan localmente en el navegador. En Android, la configuración necesaria para los avisos se copia a preferencias privadas de la aplicación.

## Notificaciones

Los avisos de Android se ejecutan mediante WorkManager y requieren permiso de notificaciones en Android 13 o posterior.

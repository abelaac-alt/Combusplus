# Seguridad de Combusplus 8.0

## Modelo sin registro

Combusplus no crea cuentas. Cada instalación genera un identificador aleatorio local. El backend almacena únicamente una huella SHA-256 salada de ese identificador y emite una sesión HMAC de duración limitada.

## Datos locales

Se guardan localmente:

- vehículos y matrícula o referencia;
- consumo y capacidad del depósito;
- favoritas;
- descuentos;
- historial de repostajes;
- preferencias y sesión de instalación.

En Android estos datos se cifran con AES-256-GCM y una clave no exportable de Android Keystore. Las copias de seguridad y la transferencia automática del almacenamiento privado están desactivadas.

## Backend

- Las claves de Precioil, sincronización y cuenta de servicio permanecen en Supabase Secrets.
- No se incluye `service_role` en la web ni en Android.
- Las tablas operativas están en el esquema `private` con permisos revocados.
- Las solicitudes utilizan sesiones firmadas por instalación.
- Se aplican límites por instalación y huella de red.
- CORS limita navegadores autorizados, aunque no se considera un mecanismo de autenticación.
- Los errores internos no se exponen en producción.
- Las ubicaciones utilizadas para buscar no se almacenan en la base de datos.

## Android

- `targetSdk 36`.
- tráfico HTTP no cifrado bloqueado;
- WebView sin acceso a archivos ni contenido local;
- depuración WebView solo en builds debug;
- enlaces externos se abren fuera del WebView;
- minificación y reducción de recursos en release;
- Play Integrity para comprobar binario, instalación y dispositivo;
- firma de producción separada mediante una clave de subida.

## Límites reales

No existe una aplicación imposible de hackear. Las medidas reducen el riesgo, limitan el abuso y evitan que un ataque al cliente exponga secretos administrativos. Una persona puede inspeccionar cualquier APK y las claves públicas de mapas o Supabase. La seguridad depende de:

- mantener secretos fuera del repositorio;
- rotarlos si se exponen;
- activar Play Integrity en modo `enforce` tras comprobarlo en Google Play;
- revisar logs y cuotas;
- actualizar dependencias;
- realizar pruebas de penetración antes de un lanzamiento masivo;
- mantener copias de seguridad y un plan de respuesta a incidentes.

## Respuesta ante incidentes

1. Desactivar o rotar el secreto afectado.
2. Cambiar `DEVICE_TOKEN_VERSION` para invalidar sesiones si fuera necesario.
3. Bloquear huellas abusivas en `private.app_installations`.
4. Revisar `private.security_events` y límites.
5. Publicar una actualización firmada.
6. Informar a usuarios y autoridades cuando la ley lo exija.

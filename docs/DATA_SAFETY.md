# Guía para Seguridad de los datos de Google Play

Esta guía refleja el código incluido en Combusplus 8.0. Debe revisarse nuevamente si se añaden analítica, publicidad, Firebase, pagos u otros SDKs.

## Comportamiento actual

- No hay registro ni cuentas.
- Vehículos, matrícula o referencia, consumo, depósito, favoritas, descuentos e historial se guardan localmente.
- La ubicación se envía temporalmente al backend cuando el usuario solicita una búsqueda.
- El backend no persiste la ubicación ni los datos del vehículo de la búsqueda.
- Se conserva una huella criptográfica de la instalación y registros técnicos de seguridad.
- No se venden datos ni se usan para publicidad.

## Declaraciones que deben revisarse en Play Console

La ubicación transmitida para ejecutar la búsqueda puede tener que declararse como datos tratados o recogidos, aunque se procese de forma efímera. Marca el uso como **funcionalidad de la aplicación**, no publicidad. Declara que los datos se cifran durante la transmisión.

El identificador de instalación y los eventos técnicos pueden encajar en **identificadores de dispositivo u otros identificadores** y **diagnóstico/seguridad**, según las opciones exactas que muestre la consola en el momento de publicar.

No marques que la aplicación no recoge ningún dato sin revisar la definición vigente de Google Play y el comportamiento de Google Maps, Supabase y Play Integrity.

## Política de privacidad

Antes del lanzamiento completa en `web/privacy.html`:

- razón social del responsable;
- NIF/CIF;
- dirección;
- correo de privacidad;
- plazos de conservación definitivos;
- proveedores y países de tratamiento;
- derechos aplicables y método de contacto.

# Seguridad de Combusplus 9.0

## Cliente

- No hay registro, correo ni contraseña.
- Los datos personales de uso permanecen en el dispositivo.
- Android cifra el almacenamiento con AES-256-GCM y una clave de Android Keystore.
- Las copias de seguridad y transferencia automática están desactivadas.
- La WebView bloquea archivos locales, contenido mixto y tráfico HTTP.
- La depuración de WebView solo está activa en compilaciones debug.
- Los enlaces externos se abren fuera de la WebView.
- La versión release usa minificación, reducción de recursos y firma propia.

## Backend

- Precioil y la service role no se incluyen en web ni APK.
- Las instalaciones reciben sesiones anónimas HMAC con caducidad.
- El servidor almacena una huella salada del identificador, no el identificador original.
- Cada endpoint valida método, origen, tamaño, parámetros y sesión.
- Hay límites de peticiones por instalación y por red.
- Los errores internos no se exponen en producción.
- Los datos operativos y eventos de seguridad se depuran automáticamente.
- Play Integrity puede exigir app reconocida, licencia y dispositivo válido.

## Google Maps

La clave de Maps JavaScript es una clave pública de navegador. Debe restringirse por API y por referencias autorizadas:

```text
https://abelaac-alt.github.io/*
https://appassets.androidplatform.net/*
```

No debe reutilizarse como clave privada de servidor.

## Repositorio

- CodeQL analiza Java y JavaScript.
- Dependabot propone actualizaciones de Gradle y GitHub Actions.
- El workflow de validación busca claves privadas accidentales y comprueba frontend, Edge Functions, XML, estructura, migraciones y versiones.

## Operación

- Rota inmediatamente cualquier secreto mostrado en capturas o commits.
- Protege la rama `main` y exige que `Validar proyecto` y CodeQL estén correctos.
- Activa secret scanning y push protection en GitHub cuando estén disponibles para el repositorio.
- Conserva la clave de subida Android fuera del repositorio.

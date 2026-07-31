# Seguridad

La aplicación permite dos tipos de clave:

- `pk_live_`: recomendada para una web pública y restringida al origin de GitHub Pages.
- `sk_live_`: habilitada para uso personal desde el dispositivo donde se introduce.

## Cómo se trata la clave

- La clave no está incluida en el código ni en el repositorio.
- Se guarda únicamente en `localStorage` del navegador.
- Se envía a Precioil mediante la cabecera `X-API-Key` y HTTPS.
- Otros visitantes de la web no reciben la clave guardada en tu dispositivo.

## Riesgos de una clave `sk_live_`

- Puede ser leída por alguien con acceso al dispositivo, extensiones maliciosas o una vulnerabilidad XSS.
- Precioil puede rechazarla si está limitada por IP o configurada exclusivamente para servidor.
- No debes escribirla en archivos, commits, capturas públicas ni parámetros de URL.
- Rota cualquier clave que se haya publicado accidentalmente.

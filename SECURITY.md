# Seguridad

- Nunca confirmes claves `sk_live_` en GitHub.
- Utiliza una `pk_live_` limitada al origin exacto de GitHub Pages.
- Limita la clave al endpoint `/estaciones/radio`.
- Rota inmediatamente cualquier credencial que haya aparecido en un chat, captura o commit.
- La aplicación rechaza claves `sk_live_` para evitar su uso accidental en el navegador.

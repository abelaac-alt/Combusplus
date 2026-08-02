# Política de seguridad

No publiques incidencias que contengan claves, tokens, contraseñas, archivos de firma o datos personales.

## Secretos que nunca deben estar en Git

- clave privada de Precioil;
- `SUPABASE_SERVICE_ROLE_KEY`;
- contraseña de base de datos;
- token personal de Supabase;
- `COMBUSPLUS_SYNC_SECRET`;
- `COMBUSPLUS_DEVICE_TOKEN_SECRET`;
- `COMBUSPLUS_RATE_LIMIT_SALT`;
- cuenta de servicio de Play Integrity;
- keystore y contraseñas Android.

## Comunicación de vulnerabilidades

Antes de publicar, sustituye este apartado por un correo privado de seguridad del responsable. Incluye versión, pasos de reproducción e impacto, pero nunca datos reales de usuarios.

Consulta [docs/SECURITY_V9.md](docs/SECURITY_V9.md) para el modelo técnico completo.

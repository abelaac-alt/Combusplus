# Refuerzo de seguridad Combusplus

## Cambios aplicados

1. El panel de administración se mantiene en la web, pero se excluye completamente
   de los APK y AAB.
2. Los recursos Android se generan en `build/generated/combusplusWebAssets`; los
   archivos antiguos de `src/main/assets` no se empaquetan.
3. La clave de Google Maps y el Map ID quedan vacíos en Android. La aplicación usa
   su mapa alternativo y continúa ofreciendo el botón para abrir la ruta.
4. La web utiliza la clave de Maps JavaScript, pero la publicación falla si la API
   key y el Map ID son iguales.
5. Todos los APK/AAB se inspeccionan automáticamente antes de publicarse.
6. Se aplica una migración que activa y fuerza RLS en todas las tablas de la
   aplicación y revoca el acceso directo de `anon` y `authenticated`.
7. El panel administrativo incorpora límite de intentos, comparación de token en
   tiempo constante y restricción de origen.

## Configuración manual obligatoria en Google Cloud

- Crea o utiliza una clave exclusiva para la web.
- Restricción de aplicación: **Sitios web**.
- Autoriza: `https://abelaac-alt.github.io/*`
- Restricción de API: **Maps JavaScript API**.
- Crea un Map ID de plataforma **JavaScript**.
- En GitHub:
  - `GOOGLE_MAPS_API_KEY` = la clave web restringida.
  - `GOOGLE_MAP_ID` = el Map ID, nunca la API key.

La clave que estuvo en APK anteriores debe restringirse o rotarse.

## Configuración en GitHub

Crea esta variable si todavía no existe:

`COMBUSPLUS_ADMIN_ALLOWED_ORIGIN=https://abelaac-alt.github.io`

La clave publicable del servicio permanece en el cliente porque se usa para
invocar funciones públicas. Su seguridad depende de RLS y de no exponer jamás
una clave de servicio; la migración incluida refuerza ambas condiciones.

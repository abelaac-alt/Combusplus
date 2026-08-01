# Combusplus 4.0

Aplicación web móvil preparada para GitHub Pages.

## Funciones

- recomendación de la gasolinera más rentable según consumo, importe, distancia y combustible
- perfiles con múltiples vehículos
- listado de estaciones y precios disponibles
- Google Maps integrado con marcadores de gasolineras
- gasolineras favoritas guardadas en el navegador
- registro de simulaciones como REPOSTADO
- historial, litros, importe total y ahorro acumulado
- instalación como PWA

## Configuración

Desde Ajustes se introducen:

1. La clave de Precioil (`pk_live_` o `sk_live_`).
2. Una clave de Google Maps JavaScript API.
3. Opcionalmente, un Map ID de Google Maps.

Las claves se guardan únicamente en `localStorage` y no forman parte del repositorio.

Para producción, restringe la clave de Google Maps por referente HTTP al dominio publicado y limita la clave a Maps JavaScript API.

## GitHub Pages

Sube el contenido de esta carpeta al repositorio y activa GitHub Pages desde la rama principal y la carpeta raíz.

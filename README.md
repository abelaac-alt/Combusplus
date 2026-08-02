# Combusplus 5.3

Aplicación web y Android para encontrar la gasolinera que más conviene según el vehículo, el importe del repostaje, la distancia y el precio del combustible.

## Novedades de la versión 5.3

- La búsqueda de la gasolinera más barata es ahora la pantalla principal.
- Flujo simplificado: vehículo, importe, radio y búsqueda.
- El cálculo compara precio personal, consumo del trayecto y litros útiles obtenidos.
- Recomendación destacada con ruta, detalles, favorita y registro como REPOSTADO.
- Web y APK utilizan exactamente la misma interfaz desde la carpeta `web`.
- Corrección del desplazamiento horizontal en pantallas móviles.
- Cabecera, navegación y ventanas adaptadas a las zonas seguras del dispositivo.
- Ajustes y fichas con desplazamiento vertical interno para que no se corten.
- WebView Android protegido frente a barras de estado, cámara frontal y barra de navegación.

## Funciones

- Buscador de la mejor gasolinera según:
  - vehículo y consumo;
  - tipo de combustible;
  - importe a repostar;
  - distancia;
  - trayecto de ida o ida y vuelta;
  - descuentos guardados.
- Comparativa de gasolineras por coste real, precio, distancia o nombre.
- Google Maps integrado.
- Gasolineras favoritas y avisos de cambios de precio.
- Historial de repostajes y ahorro acumulado.
- Gestión de vehículos y descuentos.
- PWA para GitHub Pages.
- APK Android con la web incluida dentro de la aplicación.
- Proxy opcional de Cloudflare Worker para proteger la clave de Precioil.

## Estructura

```text
web/                         Aplicación web y PWA
android/                     Proyecto Android
backend/cloudflare-worker/   Proxy seguro opcional
.github/workflows/           Publicación web y generación de APK
```

## Publicar la web

1. Sube todo el proyecto al repositorio.
2. Abre **Settings → Pages**.
3. Selecciona **GitHub Actions** como fuente.
4. Ejecuta **Publicar web**.

Dirección prevista:

```text
https://abelaac-alt.github.io/Combusplus/
```

## Generar la APK

1. Abre **Actions**.
2. Selecciona **Generar APK de prueba**.
3. Pulsa **Run workflow**.
4. Descarga el artefacto **Combusplus-APK**.

El archivo generado es:

```text
Combusplus-debug.apk
```

La Action copia automáticamente el contenido completo de `web/` a:

```text
android/app/src/main/assets/www/
```

Por este motivo, la interfaz de la APK y la web siempre es la misma.

## Instalación limpia

Al probar esta actualización:

1. Desinstala la APK anterior.
2. Instala la APK 5.3 recién generada.
3. Vuelve a introducir las claves desde Ajustes si Android eliminó los datos anteriores.

## Seguridad

- No se incluyen claves API dentro del repositorio.
- La clave directa se guarda en el dispositivo.
- Para una publicación comercial se recomienda el proxy incluido.
- Restringe la clave de Google Maps al dominio y a Maps JavaScript API.

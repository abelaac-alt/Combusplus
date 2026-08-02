# Combusplus 5

Aplicación web instalable y aplicación Android para comparar gasolineras, gestionar vehículos, guardar favoritas, registrar repostajes y recibir avisos cuando cambian los precios.

## Funciones incluidas

- Lista de gasolineras por distancia, precio por litro o precio personal.
- Google Maps integrado con marcadores y modo Top 10.
- Filtros de estaciones abiertas, radio, combustible y modo de precio por litro o depósito.
- Ficha profesional de cada estación con:
  - combustibles disponibles;
  - precio personal después de descuentos;
  - estado, horario y distancia;
  - comparación con el precio medio;
  - historial de precios registrado por Combusplus;
  - acceso a ruta, favoritos, avisos y simulación.
- Gasolineras favoritas.
- Avisos de subida o bajada para el combustible elegido en cada favorita.
- Simulación del repostaje teniendo en cuenta consumo, importe y desplazamiento.
- Botón **REPOSTADO** para registrar el repostaje.
- Estadísticas de ahorro, importe y litros.
- Gestión de vehículos y capacidad del depósito.
- Gestión de descuentos por marca, estación o combustible.
- PWA para GitHub Pages.
- APK Android con comprobaciones en segundo plano mediante WorkManager.
- Proxy opcional de Cloudflare Worker para ocultar la clave privada de Precioil.

## Estructura

```text
web/                         Aplicación web y PWA
android/                     Proyecto Android nativo
backend/cloudflare-worker/   Proxy seguro opcional
.github/workflows/           Publicación web y generación de APK
```

## Publicar la versión web

1. Crea un repositorio llamado `combusplus`.
2. Sube todo el contenido de este proyecto.
3. En GitHub abre **Settings → Pages**.
4. En `Source` selecciona **GitHub Actions**.
5. Ejecuta el flujo **Publicar web** o realiza un `push` a `main`.

La dirección prevista será:

```text
https://abelaac-alt.github.io/Combusplus/
```

Si usas otro usuario o nombre de repositorio, cambia `COMBUSPLUS_WEB_URL` en:

```text
android/gradle.properties
```

## Generar el APK automáticamente

El flujo **Generar APK de prueba** compila un APK instalable y lo guarda como artefacto:

1. Abre la pestaña **Actions** del repositorio.
2. Entra en **Generar APK de prueba**.
3. Pulsa **Run workflow**.
4. Cuando termine, descarga el artefacto **Combusplus-APK**.

El archivo generado se llama:

```text
Combusplus-debug.apk
```

## Crear una versión descargable desde GitHub Releases

Crea una etiqueta:

```bash
git tag v5.0.0
git push origin v5.0.0
```

El flujo **Publicar APK Android** creará una publicación de GitHub y adjuntará el APK.

Sin secretos de firma se genera una APK de prueba. Para una versión comercial firmada, añade estos secretos en **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

También se generará un archivo `.aab` para Google Play cuando exista una firma válida.

## Configuración recomendada de Precioil

### Producción

No introduzcas una clave `sk_live_` dentro del repositorio ni del APK. Usa el proxy incluido:

```text
backend/cloudflare-worker
```

Despliegue básico:

```bash
cd backend/cloudflare-worker
npm install
npx wrangler secret put PRECIOIL_API_KEY
npx wrangler secret put CLIENT_TOKEN
npm run deploy
```

Después introduce en Combusplus:

- URL del Worker.
- Token de cliente.
- Modo `Servidor seguro`.

Actualiza `ALLOWED_ORIGINS` en `wrangler.toml` con el dominio real de GitHub Pages.

### Uso personal

La aplicación también admite una clave directa guardada en el dispositivo, pero no es apropiado distribuir una clave privada dentro de una aplicación pública.

## Google Maps

Activa **Maps JavaScript API** y restringe la clave a tu dominio de GitHub Pages. Introduce la clave desde los ajustes de Combusplus.

El mapa se carga únicamente al abrir la pestaña Mapa, para reducir cargas facturables.

## Notificaciones de precios

### Android

La aplicación guarda en Android la configuración de favoritas y programa una comprobación periódica con WorkManager. El sistema puede retrasar las comprobaciones para optimizar batería y red; no son alarmas exactas.

### Web

La web comprueba los precios al abrir la aplicación y puede mostrar notificaciones del navegador. Los navegadores no garantizan comprobaciones periódicas cuando la página está completamente cerrada.

## Seguridad

- No hay claves API incluidas en el código.
- Las exportaciones eliminan claves y tokens.
- El proxy solo expone el endpoint de estaciones cercanas.
- Restringe la clave de Google Maps por dominio.
- Rota cualquier clave que haya sido compartida públicamente.


## Corrección 5.2

La APK carga directamente la aplicación web incluida dentro del propio APK (`android_asset/www/index.html`). Ya no depende de GitHub Pages al arrancar y no puede abrir el README del repositorio por error. La versión web continúa disponible de forma independiente.

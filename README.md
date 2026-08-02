# Combusplus 6.0

Aplicación web, PWA y Android para encontrar la gasolinera que más conviene según el vehículo, el importe del repostaje, la distancia, el consumo del trayecto y el precio real del combustible.

## Qué incluye

- Una única interfaz en `web/` compartida por GitHub Pages y la APK.
- Buscador principal de la gasolinera más rentable para un importe concreto.
- Cálculo rápido para llenar el depósito completo y abrir la ruta automáticamente.
- Vehículos con combustible, consumo y capacidad de depósito.
- Favoritas con precio actual, subida o bajada y notificaciones Android.
- Dos widgets Android para la pantalla de inicio:
  - precios de favoritas;
  - búsqueda directa del mejor llenado completo.
- Historial local de repostajes, ahorro, vehículos, descuentos y preferencias.
- Persistencia doble en Android: almacenamiento web y `SharedPreferences` privados.
- Backend Supabase con Edge Functions, caché de estaciones e histórico de precios.
- Clave privada de Precioil y `service_role` exclusivamente en secretos del servidor.
- Publicación web, generación de APK y despliegue de Supabase mediante GitHub Actions.

## Estructura

```text
web/                         Interfaz web/PWA compartida con Android
android/                     Contenedor Android, notificaciones y widgets
supabase/                    Base de datos, Edge Functions y programación
.github/workflows/           Web, APK, Release y backend
```

## Publicar la web

1. Sube todo el contenido del proyecto a la raíz del repositorio.
2. En **Settings → Pages**, selecciona **GitHub Actions**.
3. Configura las variables del repositorio descritas en `SUPABASE_SETUP.md`.
4. Ejecuta **Actions → Publicar web**.

Dirección prevista:

```text
https://abelaac-alt.github.io/Combusplus/
```

## Generar la APK

1. Abre **Actions → Generar APK de prueba**.
2. Pulsa **Run workflow**.
3. Descarga el artefacto **Combusplus-APK**.
4. Descomprime e instala `Combusplus-v6-debug.apk`.

La Action copia `web/` dentro de `android/app/src/main/assets/www/`. La APK y la web utilizan por tanto el mismo HTML, CSS, JavaScript, logo y funcionalidades.

## Servidor Supabase

Consulta [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md). El proyecto incluye:

- tablas privadas de estaciones, precios actuales e histórico;
- RLS y revocación de acceso público;
- RPC accesibles únicamente mediante `service_role`;
- Edge Function `stations-nearby` para la aplicación;
- Edge Function `sync-stations` para actualización programada;
- limitación de solicitudes;
- lista de orígenes permitidos;
- cron opcional cada 15 minutos.

## Almacenamiento local

Los siguientes datos no se suben a Supabase:

- vehículos;
- matrícula o referencia;
- descuentos;
- favoritas;
- preferencias;
- historial de repostajes;
- configuración personal.

En la web se guardan en `localStorage`. En Android se replican además en las preferencias privadas de la aplicación para evitar pérdidas por limpieza del WebView.

## Versión

- Web: `6.0.0`
- Android: `versionName 6.0.0`
- Android: `versionCode 10`

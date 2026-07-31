# Reposta Mejor

Aplicación web móvil para recomendar la gasolinera que ofrece el mejor resultado real según:

- consumo medio del vehículo;
- tipo de combustible;
- importe del repostaje;
- distancia desde la ubicación actual;
- combustible consumido en el trayecto.

La app no se limita a ordenar por precio. Para cada estación calcula los litros comprados y descuenta el combustible estimado del desplazamiento. Recomienda la alternativa con más litros netos.

## Seguridad de la API

No añadas una clave `sk_live_` al repositorio ni al código de GitHub Pages. Esa clave es de servidor.

Para esta aplicación crea en Precioil Console una **browser key** `pk_live_`:

1. Tipo: navegador.
2. Endpoint permitido: `/estaciones/radio`.
3. Origin permitido para este proyecto: `https://abelaac-alt.github.io`.
4. Revoca y sustituye cualquier clave de servidor que haya sido publicada o compartida accidentalmente.

La clave `pk_live_` se introduce desde el botón de ajustes de la aplicación y se almacena únicamente en `localStorage` del navegador. No queda incluida en GitHub.

## Publicación en GitHub Pages

1. Crea un repositorio público llamado `reposta-mejor`.
2. Sube todo el contenido de esta carpeta a la raíz del repositorio.
3. Abre `Settings` → `Pages`.
4. En `Build and deployment`, selecciona `Deploy from a branch`.
5. Elige la rama `main` y la carpeta `/ (root)`.
6. La aplicación quedará disponible en:

   `https://abelaac-alt.github.io/reposta-mejor/`

## Prueba local

```bash
npm test
npm run serve
```

Después abre `http://localhost:8080`. La geolocalización funciona en localhost y en GitHub Pages mediante HTTPS.

## Algoritmo

Para cada estación:

```text
litros comprados = importe / precio por litro
km estimados por carretera = distancia geográfica × 1,18
litros del trayecto = km del trayecto × consumo / 100
litros netos = litros comprados − litros del trayecto
```

Se ordenan las estaciones de mayor a menor cantidad de litros netos.

## Privacidad

- La ubicación se usa solo durante el cálculo.
- La ubicación no se guarda.
- La browser key se almacena únicamente en el dispositivo.
- El service worker nunca intercepta ni almacena las solicitudes a Precioil.

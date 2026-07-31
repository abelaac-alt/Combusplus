# Reposta Mejor

Aplicación web móvil para recomendar la gasolinera que ofrece el mejor resultado real según:

- consumo medio del vehículo;
- tipo de combustible;
- importe del repostaje;
- distancia desde la ubicación actual;
- combustible consumido en el trayecto.

La app no se limita a ordenar por precio. Para cada estación calcula los litros comprados y descuenta el combustible estimado del desplazamiento. Recomienda la alternativa con más litros netos.

## Clave API de Precioil

La pantalla de configuración acepta:

- una clave de navegador `pk_live_`;
- una clave de servidor `sk_live_` para uso personal.

La clave se introduce desde el botón de ajustes y se guarda únicamente en `localStorage` del dispositivo. No está escrita en el código ni se sube a GitHub.

### Consideraciones para `sk_live_`

La aplicación ya no bloquea este tipo de clave. No obstante, Precioil puede rechazar la petición si la clave está restringida por IP o configurada exclusivamente para llamadas desde servidor. En ese caso será necesario utilizar una clave `pk_live_` o colocar un pequeño proxy backend delante de la API.

No incluyas nunca una clave `sk_live_` directamente en `src/app.js`, `index.html`, un commit o una URL.

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
- La API key se almacena únicamente en el dispositivo.
- El service worker nunca intercepta ni almacena las solicitudes a Precioil.

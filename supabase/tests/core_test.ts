import {
  buildRecommendation,
  validateRecommendationInput,
} from '../functions/_shared/recommendation.ts';
import { normalizeStation } from '../functions/_shared/stations.ts';
import { parseSyncPoints } from '../functions/_shared/provider.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('rechaza coordenadas vacías o nulas', () => {
  for (const latitude of [null, '']) {
    let rejected = false;
    try {
      validateRecommendationInput({
        latitude,
        longitude: -5.98,
        radius: 15,
        fuelKey: 'Diesel',
        consumption: 6,
        amount: 50,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, `La latitud ${String(latitude)} debía rechazarse`);
  }
});

Deno.test('normaliza estaciones sin convertir campos ausentes en cero', () => {
  assert(normalizeStation({ rotulo: 'Sin coordenadas' }) === null, 'Aceptó coordenadas ausentes');
  const station = normalizeStation({
    idEstacion: '1',
    rotulo: 'Prueba',
    latitud: '37,39',
    longitud: '-5,98',
    Diesel: '1,599',
  });
  assert(station?.latitude === 37.39, 'No normalizó la latitud decimal');
  assert(station?.prices.Diesel === 1.599, 'No normalizó el precio decimal');
});

Deno.test('filtra puntos de sincronización inválidos', () => {
  const points = parseSyncPoints(JSON.stringify([
    { latitude: null, longitude: -5.98 },
    { latitude: 37.39, longitude: -5.98, radius: 'abc' },
  ]));
  assert(points.length === 1, 'No filtró el punto con latitud nula');
  assert(points[0].radius === 30, 'No aplicó el radio predeterminado');
});

Deno.test('calcula y ordena recomendaciones válidas', () => {
  const input = validateRecommendationInput({
    latitude: 37.39,
    longitude: -5.98,
    radius: 15,
    fuelKey: 'Diesel',
    consumption: 6,
    amount: 50,
    tripMode: 'roundtrip',
  });
  const result = buildRecommendation([
    { idEstacion: 'cerca', rotulo: 'Cerca', latitud: 37.4, longitud: -5.98, distancia: 1, Diesel: 1.65 },
    { idEstacion: 'lejos', rotulo: 'Lejos', latitud: 37.45, longitud: -5.98, distancia: 6, Diesel: 1.55 },
  ], input);
  assert(result.items.length === 2, 'No devolvió ambas estaciones');
  assert(result.best !== null, 'No seleccionó una recomendación');
  assert(result.items[0].effectivePrice <= result.items[1].effectivePrice, 'No ordenó por coste efectivo');
});

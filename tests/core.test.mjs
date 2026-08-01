import assert from 'node:assert/strict';
import { extractStationArray, normalizeStation, normalizeStationForList, rankStations, equivalentSaving } from '../src/core.js';

const origin = { latitude: 37.3891, longitude: -5.9845 };
const payload = {
  items: [
    { idEstacion: 1, nombreEstacion: 'CERCANA', direccion: 'Calle Uno', latitud: 37.3991, longitud: -5.9845, distancia: 1.1, Gasolina95: '1.700', Diesel: '1.620' },
    { idEstacion: 2, nombreEstacion: 'BARATA LEJANA', direccion: 'Calle Dos', latitud: 37.4491, longitud: -5.9845, distancia: 6.5, Gasolina95: '1.620', Diesel: '1.580' }
  ]
};

assert.equal(extractStationArray(payload).length, 2);
assert.equal(normalizeStation(payload.items[0], 'Gasolina95', origin).price, 1.7);
assert.equal(normalizeStationForList(payload.items[0], origin).fuels.length, 2);

const rankedSmall = rankStations(payload.items, 'Gasolina95', origin, { consumption: 7, amount: 20, tripMode: 'roundtrip' });
assert.equal(rankedSmall[0].name, 'CERCANA');

const rankedLarge = rankStations(payload.items, 'Gasolina95', origin, { consumption: 5, amount: 120, tripMode: 'roundtrip' });
assert.equal(rankedLarge[0].name, 'BARATA LEJANA');
assert.ok(equivalentSaving(rankedLarge[0], rankedLarge[1]) >= 0);

console.log('Tests correctos');

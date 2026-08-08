import assert from 'node:assert/strict';
import {
  extractStationArray,
  normalizeStationForList,
  personalPrice,
  rankNormalizedStations,
  rankFullTankStations,
  equivalentSaving,
  scoreNormalizedStation,
  parseNumeric,
  mapsUrl,
  priceRange
} from '../src/core.js';

assert.equal(parseNumeric(' 1,659 € '), 1.659);
assert.equal(parseNumeric(''), null);
assert.equal(parseNumeric(null), null);
assert.deepEqual(extractStationArray({ data: { stations: [{ id: 1 }] } }), [{ id: 1 }]);

const origin = { latitude: 37.39, longitude: -5.98 };
const payload = { items: [
  { idEstacion: 1, rotulo: 'CERCANA', direccion: 'Uno', latitud: 37.40, longitud: -5.98, distancia: 1, Gasolina95: '1,70', Diesel: '1,60', horario: '00:00-24:00' },
  { idEstacion: 2, rotulo: 'LEJANA', direccion: 'Dos', latitud: 37.45, longitud: -5.98, distancia: 6, Gasolina95: '1,61', Diesel: '1,55' }
] };

assert.equal(extractStationArray(payload).length, 2);
const stations = payload.items.map(item => normalizeStationForList(item, origin));
assert.equal(stations[0].isOpen, true);
assert.equal(normalizeStationForList({ rotulo: 'Sin distancia' }, null), null);
assert.equal(
  personalPrice(stations[0], 'Gasolina95', [{ fuelKey: 'Gasolina95', type: 'perLiter', value: .05, stationMatch: '' }]),
  1.65
);

const small = rankNormalizedStations(stations, {
  fuelKey: 'Gasolina95', discounts: [], consumption: 7, amount: 20, tripMode: 'roundtrip'
});
assert.equal(small[0].name, 'CERCANA');

const large = rankNormalizedStations(stations, {
  fuelKey: 'Gasolina95', discounts: [], consumption: 5, amount: 120, tripMode: 'roundtrip'
});
assert.equal(large[0].name, 'LEJANA');
assert.ok(equivalentSaving(large[0], large[1]) >= 0);

const oneWay = scoreNormalizedStation(stations[1], {
  fuelKey: 'Gasolina95', discounts: [], consumption: 6, amount: 50, tripMode: 'oneway'
});
const roundTrip = scoreNormalizedStation(stations[1], {
  fuelKey: 'Gasolina95', discounts: [], consumption: 6, amount: 50, tripMode: 'roundtrip'
});
assert.ok(oneWay.tripKm < roundTrip.tripKm);
assert.ok(oneWay.tripLiters < roundTrip.tripLiters);
assert.ok(oneWay.netLiters > roundTrip.netLiters);

const fullTank = rankFullTankStations(stations, {
  fuelKey: 'Gasolina95',
  discounts: [],
  consumption: 5,
  tankCapacity: 50,
  tripMode: 'roundtrip'
});
assert.equal(fullTank[0].name, 'LEJANA');
assert.equal(fullTank[0].fullTank, true);
assert.ok(fullTank[0].tankCost > 0);
assert.ok(fullTank[0].netLiters < 50);

const selected = fullTank[1];
const best = fullTank[0];
const sameUsefulLitersCostAtSelected = selected.effectivePrice * best.netLiters;
const sameUsefulLitersCostAtBest = best.effectivePrice * best.netLiters;
assert.ok(sameUsefulLitersCostAtSelected >= sameUsefulLitersCostAtBest);
assert.deepEqual(priceRange(stations, 'Gasolina95'), { min: 1.61, max: 1.7 });
assert.match(mapsUrl(stations[0]), /^https:\/\/www\.google\.com\/maps\/dir\//);
assert.match(
  mapsUrl({ name: 'Estación prueba', address: 'Sevilla' }),
  /maps\/search/
);

console.log('Tests correctos · importe, depósito, ida, ida y vuelta y comparación');

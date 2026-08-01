const ROAD_DISTANCE_FACTOR = 1.18;

export const FUEL_DEFINITIONS = {
  Gasolina95: { label: 'Gasolina 95', aliases: ['Gasolina95', 'Gasolina 95', 'Gasolina 95 E5', 'Precio Gasolina 95 E5', 'PrecioGasolina95'] },
  Diesel: { label: 'Diésel A', aliases: ['Diesel', 'Diésel', 'GasoleoA', 'Gasóleo A', 'Precio Gasóleo A', 'PrecioGasoleoA'] },
  Gasolina98: { label: 'Gasolina 98', aliases: ['Gasolina98', 'Gasolina 98', 'Gasolina 98 E5', 'Precio Gasolina 98 E5', 'PrecioGasolina98'] },
  DieselPremium: { label: 'Diésel Premium', aliases: ['DieselPremium', 'Diésel Premium', 'GasoleoPremium', 'Gasóleo Premium', 'Precio Gasóleo Premium'] },
  GLP: { label: 'GLP', aliases: ['GLP', 'Gases licuados del petróleo', 'Precio GLP'] },
  DieselB: { label: 'Diésel B', aliases: ['DieselB', 'Diésel B', 'GasoleoB', 'Gasóleo B', 'Precio Gasóleo B'] }
};

export function parseNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getByAliases(object, aliases) {
  if (!object || typeof object !== 'object') return undefined;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(object, alias)) return object[alias];
  }
  const normalizedAliases = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(object)) {
    if (normalizedAliases.has(normalizeKey(key))) return value;
  }
  return undefined;
}

export function extractStationArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'estaciones', 'stations']) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = extractStationArray(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeDistance(rawDistance) {
  const value = parseNumeric(rawDistance);
  if (value === null || value < 0) return null;
  return value > 100 ? value / 1000 : value;
}

function baseStation(raw, origin) {
  const latitude = parseNumeric(getByAliases(raw, ['latitud', 'latitude', 'lat', 'Latitud']));
  const longitude = parseNumeric(getByAliases(raw, ['longitud', 'longitude', 'lon', 'lng', 'Longitud']));
  let distanceKm = normalizeDistance(getByAliases(raw, ['distancia', 'distance', 'distanciaKm', 'distanceKm', 'kilometros']));
  if (distanceKm === null && latitude !== null && longitude !== null && origin) {
    distanceKm = haversineKm(origin.latitude, origin.longitude, latitude, longitude);
  }
  if (distanceKm === null) return null;

  const name = getByAliases(raw, ['nombreEstacion', 'rotulo', 'rótulo', 'nombre', 'marca', 'label']) || 'Estación de servicio';
  const addressParts = [
    getByAliases(raw, ['direccion', 'dirección', 'address']),
    getByAliases(raw, ['localidad', 'municipio', 'city']),
    getByAliases(raw, ['provincia', 'province'])
  ].filter(Boolean);

  return {
    id: getByAliases(raw, ['idEstacion', 'id', 'stationId']) || `${name}-${latitude}-${longitude}`,
    name: String(name),
    address: addressParts.join(' · ') || 'Dirección no disponible',
    latitude,
    longitude,
    distanceKm,
    updatedAt: getByAliases(raw, ['updatedAt', 'fechaActualizacion', 'fecha', 'date']) || null,
    raw
  };
}

export function extractAvailableFuelPrices(raw) {
  return Object.entries(FUEL_DEFINITIONS).map(([key, def]) => {
    const price = parseNumeric(getByAliases(raw, def.aliases));
    if (!price || price <= 0 || price > 5) return null;
    return { key, label: def.label, price };
  }).filter(Boolean);
}

export function normalizeStation(raw, fuelKey, origin) {
  const station = baseStation(raw, origin);
  const fuel = FUEL_DEFINITIONS[fuelKey];
  if (!station || !fuel) return null;
  const price = parseNumeric(getByAliases(raw, fuel.aliases));
  if (!price || price <= 0 || price > 5) return null;
  return { ...station, price };
}

export function normalizeStationForList(raw, origin) {
  const station = baseStation(raw, origin);
  if (!station) return null;
  return { ...station, fuels: extractAvailableFuelPrices(raw) };
}

export function scoreStation(station, { consumption, amount, tripMode = 'roundtrip', roadFactor = ROAD_DISTANCE_FACTOR }) {
  const legs = tripMode === 'oneway' ? 1 : 2;
  const roadDistanceKm = station.distanceKm * roadFactor;
  const tripKm = roadDistanceKm * legs;
  const purchasedLiters = amount / station.price;
  const tripLiters = tripKm * consumption / 100;
  const netLiters = purchasedLiters - tripLiters;
  if (!Number.isFinite(netLiters) || netLiters <= 0) return null;
  return {
    ...station,
    roadDistanceKm,
    tripKm,
    purchasedLiters,
    tripLiters,
    netLiters,
    effectivePrice: amount / netLiters
  };
}

export function rankStations(rawStations, fuelKey, origin, input) {
  return rawStations
    .map(raw => normalizeStation(raw, fuelKey, origin))
    .filter(Boolean)
    .map(station => scoreStation(station, input))
    .filter(Boolean)
    .sort((a, b) => b.netLiters - a.netLiters || a.distanceKm - b.distanceKm);
}

export function equivalentSaving(best, reference) {
  if (!best || !reference || reference.id === best.id) return 0;
  return Math.max(0, (reference.effectivePrice - best.effectivePrice) * best.netLiters);
}

export function mapsUrl(station) {
  if (Number.isFinite(station.latitude) && Number.isFinite(station.longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${station.name} ${station.address}`)}`;
}

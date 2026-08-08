export type JsonRecord = Record<string, unknown>;

export interface NormalizedStation {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  schedule: string;
  isOpen: boolean | null;
  sourceUpdatedAt: string | null;
  prices: Record<string, number>;
  raw: JsonRecord;
}

const FUEL_ALIASES: Record<string, string[]> = {
  Gasolina95: [
    'Gasolina95', 'Gasolina 95', 'Gasolina 95 E5',
    'Precio Gasolina 95 E5', 'PrecioGasolina95',
  ],
  Diesel: [
    'Diesel', 'Diésel', 'GasoleoA', 'Gasóleo A',
    'Precio Gasóleo A', 'PrecioGasoleoA',
  ],
  Gasolina98: [
    'Gasolina98', 'Gasolina 98', 'Gasolina 98 E5',
    'Precio Gasolina 98 E5', 'PrecioGasolina98',
  ],
  DieselPremium: [
    'DieselPremium', 'Diésel Premium', 'GasoleoPremium',
    'Gasóleo Premium', 'Precio Gasóleo Premium',
  ],
  GLP: ['GLP', 'Gases licuados del petróleo', 'Precio GLP'],
  DieselB: [
    'DieselB', 'Diésel B', 'GasoleoB', 'Gasóleo B', 'Precio Gasóleo B',
  ],
};

const normalizeKey = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

function byAliases(raw: JsonRecord, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(raw, alias)) return raw[alias];
  }
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(raw)) {
    if (wanted.has(normalizeKey(key))) return value;
  }
  return undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text
    .replace(',', '.')
    .replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(raw: JsonRecord, aliases: string[]): string {
  return String(byAliases(raw, aliases) ?? '').trim();
}

function isoTimestamp(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  const match = text.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) return null;
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const parsed = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second),
  );
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function extractItems(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is JsonRecord =>
      Boolean(item) && typeof item === 'object'
    );
  }
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as JsonRecord;
  for (const key of ['items', 'data', 'results', 'estaciones', 'stations']) {
    const nested = extractItems(obj[key]);
    if (nested.length) return nested;
  }
  return [];
}

export function normalizeStation(raw: JsonRecord): NormalizedStation | null {
  const latitude = numberValue(byAliases(raw, ['latitud', 'latitude', 'lat', 'Latitud']));
  const longitude = numberValue(byAliases(raw, ['longitud', 'longitude', 'lon', 'lng', 'Longitud']));
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const name = stringValue(raw, [
    'nombreEstacion', 'rotulo', 'rótulo', 'nombre', 'marca', 'label',
  ]) || 'Estación de servicio';
  const address = stringValue(raw, ['direccion', 'dirección', 'address']);
  const city = stringValue(raw, ['localidad', 'municipio', 'city']);
  const province = stringValue(raw, ['provincia', 'province']);
  const postalCode = stringValue(raw, ['codigoPostal', 'código postal', 'postalCode']);
  const schedule = stringValue(raw, ['horario', 'schedule', 'openingHours', 'Horario']);
  const id = stringValue(raw, ['idEstacion', 'id', 'stationId', 'IDEESS']) ||
    `${name}-${latitude.toFixed(6)}-${longitude.toFixed(6)}`;

  const prices: Record<string, number> = {};
  for (const [fuelKey, aliases] of Object.entries(FUEL_ALIASES)) {
    const price = numberValue(byAliases(raw, aliases));
    if (price != null && price > 0 && price < 10) prices[fuelKey] = price;
  }

  return {
    id,
    name,
    brand: stringValue(raw, ['marca', 'rotulo', 'rótulo', 'brand']) || name,
    address,
    city,
    province,
    postalCode,
    latitude,
    longitude,
    schedule,
    isOpen: schedule ? /00:00\s*-\s*24:00|24\s*h/i.test(schedule) : null,
    sourceUpdatedAt: isoTimestamp(
      byAliases(raw, ['updatedAt', 'fechaActualizacion', 'fecha', 'date']),
    ),
    prices,
    raw,
  };
}

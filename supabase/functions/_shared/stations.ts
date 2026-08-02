const FUEL_ALIASES: Record<string, string[]> = {
  Gasolina95: ['Gasolina95','Gasolina 95','Gasolina 95 E5','Precio Gasolina 95 E5','PrecioGasolina95'],
  Diesel: ['Diesel','Diésel','GasoleoA','Gasóleo A','Precio Gasóleo A','PrecioGasoleoA'],
  Gasolina98: ['Gasolina98','Gasolina 98','Gasolina 98 E5','Precio Gasolina 98 E5','PrecioGasolina98'],
  DieselPremium: ['DieselPremium','Diésel Premium','GasoleoPremium','Gasóleo Premium','Precio Gasóleo Premium'],
  GLP: ['GLP','Gases licuados del petróleo','Precio GLP'],
  DieselB: ['DieselB','Diésel B','GasoleoB','Gasóleo B','Precio Gasóleo B'],
};

const normalizeKey = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const byAliases = (raw: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(raw, alias)) return raw[alias];
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(raw)) if (wanted.has(normalizeKey(key))) return value;
  return undefined;
};
const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? '').trim().replace(',','.').replace(/[^0-9.-]/g,''));
  return Number.isFinite(parsed) ? parsed : null;
};
const stringValue = (raw: Record<string, unknown>, aliases: string[]) => String(byAliases(raw, aliases) ?? '').trim();

function isoTimestamp(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const parsed = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function extractItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ['items','data','results','estaciones','stations']) {
    const value = obj[key];
    const nested = extractItems(value);
    if (nested.length) return nested;
  }
  return [];
}

export function normalizeStation(raw: Record<string, unknown>) {
  const latitude = numberValue(byAliases(raw,['latitud','latitude','lat','Latitud']));
  const longitude = numberValue(byAliases(raw,['longitud','longitude','lon','lng','Longitud']));
  if (latitude == null || longitude == null) return null;
  const name = stringValue(raw,['nombreEstacion','rotulo','rótulo','nombre','marca','label']) || 'Estación de servicio';
  const address = stringValue(raw,['direccion','dirección','address']);
  const city = stringValue(raw,['localidad','municipio','city']);
  const province = stringValue(raw,['provincia','province']);
  const postalCode = stringValue(raw,['codigoPostal','código postal','postalCode']);
  const schedule = stringValue(raw,['horario','schedule','openingHours','Horario']);
  const id = stringValue(raw,['idEstacion','id','stationId','IDEESS']) || `${name}-${latitude}-${longitude}`;
  const prices: Record<string, number> = {};
  for (const [fuelKey, aliases] of Object.entries(FUEL_ALIASES)) {
    const price = numberValue(byAliases(raw, aliases));
    if (price != null && price > 0 && price < 10) prices[fuelKey] = price;
  }
  return {
    id, name, brand: stringValue(raw,['marca','rotulo','rótulo','brand']) || name,
    address, city, province, postalCode, latitude, longitude, schedule,
    isOpen: schedule ? /00:00\s*-\s*24:00|24\s*h/i.test(schedule) : null,
    sourceUpdatedAt: isoTimestamp(byAliases(raw,['updatedAt','fechaActualizacion','fecha','date'])),
    prices, raw,
  };
}

export function haversineKm(lat1:number, lon1:number, lat2:number, lon2:number): number {
  const r=(d:number)=>d*Math.PI/180, R=6371, dLat=r(lat2-lat1), dLon=r(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export function dbStationToPayload(station: Record<string, unknown>, prices: Record<string, number>, history: unknown[] = []) {
  return {
    idEstacion: station.station_id,
    rotulo: station.name,
    marca: station.brand,
    direccion: station.address,
    localidad: station.city,
    provincia: station.province,
    codigoPostal: station.postal_code,
    latitud: station.latitude,
    longitud: station.longitude,
    horario: station.schedule,
    abierta: station.is_open,
    fechaActualizacion: station.source_updated_at || station.last_seen_at,
    ...prices,
    _history: history,
  };
}

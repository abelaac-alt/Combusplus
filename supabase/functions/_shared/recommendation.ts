const ROAD_FACTOR = 1.18;
const FUEL_KEYS = ['Gasolina95', 'Diesel', 'Gasolina98', 'DieselPremium', 'GLP', 'DieselB'] as const;

type FuelKey = typeof FUEL_KEYS[number];

export interface DiscountRule {
  stationMatch?: string;
  fuelKey?: string;
  type?: 'perLiter' | 'percent' | 'fixed';
  value?: number;
}

export interface RecommendationInput {
  latitude: number;
  longitude: number;
  radius: number;
  limit: number;
  fuelKey: FuelKey;
  consumption: number;
  amount: number;
  tankCapacity: number;
  tripMode: 'oneway' | 'roundtrip';
  fullTank: boolean;
  discounts: DiscountRule[];
  selectedStationId?: string;
}

export interface StationView {
  id: string;
  name: string;
  brand: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  schedule: string;
  isOpen: boolean | null;
  updatedAt: string | null;
  fuels: { key: FuelKey; label: string; price: number }[];
}

export interface ScoredStation extends StationView {
  price: number;
  basePrice: number;
  discount: number;
  roadDistanceKm: number;
  tripKm: number;
  purchasedLiters: number;
  tripLiters: number;
  netLiters: number;
  effectivePrice: number;
  tankCost?: number;
  fullTank: boolean;
}

const labels: Record<FuelKey, string> = {
  Gasolina95: 'Gasolina 95 E5',
  Diesel: 'Gasóleo A',
  Gasolina98: 'Gasolina 98 E5',
  DieselPremium: 'Gasóleo Premium',
  GLP: 'GLP',
  DieselB: 'Gasóleo B',
};

function text(value: unknown, max = 180): string {
  return String(value ?? '').trim().slice(0, max);
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validateRecommendationInput(raw: Record<string, unknown>): RecommendationInput {
  const latitude = finite(raw.latitude);
  const longitude = finite(raw.longitude);
  const radius = finite(raw.radius);
  const consumption = finite(raw.consumption);
  const amount = finite(raw.amount) ?? 0;
  const tankCapacity = finite(raw.tankCapacity) ?? 0;
  const limit = Math.min(100, Math.max(1, Math.floor(finite(raw.limit) ?? 50)));
  const fuelKey = text(raw.fuelKey, 30) as FuelKey;
  const tripMode = raw.tripMode === 'oneway' ? 'oneway' : 'roundtrip';
  const fullTank = raw.fullTank === true;
  if (latitude == null || latitude < -90 || latitude > 90) throw new Error('Latitud no válida.');
  if (longitude == null || longitude < -180 || longitude > 180) throw new Error('Longitud no válida.');
  if (radius == null || radius < 1 || radius > 50) throw new Error('Radio no válido.');
  if (!FUEL_KEYS.includes(fuelKey)) throw new Error('Combustible no válido.');
  if (consumption == null || consumption < 1 || consumption > 30) throw new Error('Consumo no válido.');
  if (fullTank) {
    if (tankCapacity < 10 || tankCapacity > 200) throw new Error('Capacidad del depósito no válida.');
  } else if (amount < 5 || amount > 500) throw new Error('Importe no válido.');
  const discounts = Array.isArray(raw.discounts) ? raw.discounts.slice(0, 20).map((entry) => {
    const value = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    return {
      stationMatch: text(value.stationMatch, 80),
      fuelKey: text(value.fuelKey, 30) || 'all',
      type: value.type === 'percent' ? 'percent' : 'perLiter',
      value: Math.min(100, Math.max(0, finite(value.value) ?? 0)),
    } as DiscountRule;
  }) : [];
  return {
    latitude, longitude, radius, limit, fuelKey, consumption, amount, tankCapacity,
    tripMode, fullTank, discounts, selectedStationId: text(raw.selectedStationId, 200) || undefined,
  };
}

export function normalizeSnapshot(item: Record<string, unknown>): StationView | null {
  const latitude = finite(item.latitud);
  const longitude = finite(item.longitud);
  const distanceKm = finite(item.distancia);
  if (latitude == null || longitude == null || distanceKm == null) return null;
  const fuels = FUEL_KEYS.map((key) => {
    const price = finite(item[key]);
    return price != null && price > 0 && price < 10 ? { key, label: labels[key], price } : null;
  }).filter(Boolean) as StationView['fuels'];
  return {
    id: text(item.idEstacion, 200),
    name: text(item.rotulo || item.marca || 'Gasolinera', 150),
    brand: text(item.marca || item.rotulo || '', 120),
    address: text(item.direccion || 'Dirección no disponible', 220),
    city: text(item.localidad, 100),
    province: text(item.provincia, 100),
    postalCode: text(item.codigoPostal, 20),
    latitude, longitude, distanceKm,
    schedule: text(item.horario || 'Horario no disponible', 200),
    isOpen: typeof item.abierta === 'boolean' ? item.abierta : null,
    updatedAt: item.fechaActualizacion ? text(item.fechaActualizacion, 60) : null,
    fuels,
  };
}

function discount(station: StationView, fuelKey: FuelKey, basePrice: number, rules: DiscountRule[]): number {
  const haystack = normalizeKey(`${station.name} ${station.brand} ${station.address}`);
  return rules.reduce((sum, rule) => {
    if (rule.fuelKey && rule.fuelKey !== 'all' && rule.fuelKey !== fuelKey) return sum;
    if (rule.stationMatch && !haystack.includes(normalizeKey(rule.stationMatch))) return sum;
    const raw = Number(rule.value) || 0;
    return sum + (rule.type === 'percent' ? basePrice * raw / 100 : raw);
  }, 0);
}

function score(station: StationView, input: RecommendationInput): ScoredStation | null {
  const basePrice = station.fuels.find((fuel) => fuel.key === input.fuelKey)?.price;
  if (!basePrice) return null;
  const appliedDiscount = discount(station, input.fuelKey, basePrice, input.discounts);
  const price = Math.max(0.001, basePrice - appliedDiscount);
  const roadDistanceKm = station.distanceKm * ROAD_FACTOR;
  const tripKm = roadDistanceKm * (input.tripMode === 'oneway' ? 1 : 2);
  const tripLiters = tripKm * input.consumption / 100;
  const purchasedLiters = input.fullTank ? input.tankCapacity : input.amount / price;
  const netLiters = purchasedLiters - tripLiters;
  if (!Number.isFinite(netLiters) || netLiters <= 0) return null;
  const refuelCost = input.fullTank ? input.tankCapacity * price : input.amount;
  return {
    ...station,
    price,
    basePrice,
    discount: appliedDiscount,
    roadDistanceKm,
    tripKm,
    purchasedLiters,
    tripLiters,
    netLiters,
    effectivePrice: refuelCost / netLiters,
    tankCost: input.fullTank ? refuelCost : undefined,
    fullTank: input.fullTank,
  };
}

function saving(best: ScoredStation, reference: ScoredStation): number {
  if (best.id === reference.id) return 0;
  return Math.max(0, (reference.effectivePrice - best.effectivePrice) * best.netLiters);
}

export function buildRecommendation(snapshot: Record<string, unknown>[], input: RecommendationInput) {
  const stations = snapshot.map(normalizeSnapshot).filter(Boolean) as StationView[];
  const ranked = stations.map((station) => score(station, input)).filter(Boolean) as ScoredStation[];
  ranked.sort((a, b) => a.effectivePrice - b.effectivePrice || a.distanceKm - b.distanceKm);
  const best = ranked[0] || null;
  const nearest = ranked.length ? [...ranked].sort((a, b) => a.distanceKm - b.distanceKm)[0] : null;
  const selected = input.selectedStationId
    ? ranked.find((station) => station.id === input.selectedStationId) || null
    : null;
  const referenceLiters = best?.netLiters || 0;
  const comparison = best && selected ? {
    best,
    selected,
    saving: Math.max(0, selected.effectivePrice * referenceLiters - best.effectivePrice * referenceLiters),
    extraUsefulLiters: Math.max(0, best.netLiters - selected.netLiters),
    referenceLiters,
  } : null;
  return {
    items: ranked.slice(0, input.limit),
    best,
    nearest,
    saving: best && nearest ? saving(best, nearest) : 0,
    comparison,
  };
}

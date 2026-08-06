import { enforceRateLimit, nearbySnapshot } from '../_shared/database.ts';
import {
  normalizeSnapshot,
  type DiscountRule,
  type StationView,
} from '../_shared/recommendation.ts';
import { requireDeviceSession } from '../_shared/session.ts';
import {
  jsonResponse,
  preflight,
  readJsonBody,
  requireTrustedOrigin,
  safeError,
} from '../_shared/security.ts';

type FuelKey =
  | 'Gasolina95'
  | 'Diesel'
  | 'Gasolina98'
  | 'DieselPremium'
  | 'GLP'
  | 'DieselB';

type TripMode = 'oneway' | 'roundtrip';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface RouteInput {
  latitude: number;
  longitude: number;
  destination: string;
  maxDetourKm: number;
  fuelKey: FuelKey;
  consumption: number;
  amount: number;
  tankCapacity: number;
  fullTank: boolean;
  tripMode: TripMode;
  discounts: DiscountRule[];
  stationQuery: string;
  openOnly: boolean;
  limit: number;
}

interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
  status?: {
    code?: number;
    message?: string;
  };
}

interface CandidateStation extends StationView {
  roughRouteDistanceKm: number;
}

interface RouteScoredStation extends CandidateStation {
  price: number;
  basePrice: number;
  discount: number;
  directRouteKm: number;
  routeTotalKm: number;
  detourKm: number;
  routeDurationSeconds: number;
  detourDurationSeconds: number;
  stopLeg: 'outbound' | 'return';
  purchasedLiters: number;
  detourLiters: number;
  routeFuelLiters: number;
  netLiters: number;
  effectivePrice: number;
  tripKm: number;
  roadDistanceKm: number;
  tankCost?: number;
  fullTank: boolean;
}

const FUEL_KEYS: FuelKey[] = [
  'Gasolina95',
  'Diesel',
  'Gasolina98',
  'DieselPremium',
  'GLP',
  'DieselB',
];

const MAX_MATRIX_CANDIDATES = 14;
const ROUTES_BASE_URL = 'https://routes.googleapis.com';

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown, max = 240): string {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDurationSeconds(value: unknown): number {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value ?? ''));
  return match ? Number(match[1]) : 0;
}

function validateInput(raw: Record<string, unknown>): RouteInput {
  const latitude = finite(raw.latitude);
  const longitude = finite(raw.longitude);
  const destination = text(raw.destination, 240);
  const maxDetourKm = finite(raw.maxDetourKm ?? raw.radius);
  const fuelKey = text(raw.fuelKey, 30) as FuelKey;
  const consumption = finite(raw.consumption);
  const amount = finite(raw.amount) ?? 0;
  const tankCapacity = finite(raw.tankCapacity) ?? 0;
  const fullTank = raw.fullTank === true;
  const tripMode: TripMode =
    raw.tripMode === 'oneway' ? 'oneway' : 'roundtrip';
  const stationQuery = text(raw.stationQuery, 100);
  const openOnly = raw.openOnly === true;
  const limit = Math.min(
    30,
    Math.max(1, Math.floor(finite(raw.limit) ?? 20)),
  );

  if (latitude == null || latitude < -90 || latitude > 90) {
    throw new Error('Latitud no válida.');
  }
  if (longitude == null || longitude < -180 || longitude > 180) {
    throw new Error('Longitud no válida.');
  }
  if (destination.length < 3) {
    throw new Error('Indica una dirección de destino válida.');
  }
  if (
    maxDetourKm == null ||
    maxDetourKm < 0.5 ||
    maxDetourKm > 25
  ) {
    throw new Error('El desvío máximo debe estar entre 0,5 y 25 km.');
  }
  if (!FUEL_KEYS.includes(fuelKey)) {
    throw new Error('Combustible no válido.');
  }
  if (
    consumption == null ||
    consumption < 1 ||
    consumption > 30
  ) {
    throw new Error('Consumo no válido.');
  }
  if (fullTank) {
    if (tankCapacity < 10 || tankCapacity > 200) {
      throw new Error('Capacidad del depósito no válida.');
    }
  } else if (amount < 5 || amount > 500) {
    throw new Error('Importe no válido.');
  }

  const discounts = Array.isArray(raw.discounts)
    ? raw.discounts.slice(0, 30).map((entry) => {
      const value =
        entry && typeof entry === 'object'
          ? entry as Record<string, unknown>
          : {};
      return {
        stationMatch: text(value.stationMatch, 80),
        fuelKey: text(value.fuelKey, 30) || 'all',
        type: value.type === 'percent' ? 'percent' : 'perLiter',
        value: Math.min(
          100,
          Math.max(0, finite(value.value) ?? 0),
        ),
      } as DiscountRule;
    })
    : [];

  return {
    latitude,
    longitude,
    destination,
    maxDetourKm,
    fuelKey,
    consumption,
    amount,
    tankCapacity,
    fullTank,
    tripMode,
    discounts,
    stationQuery,
    openOnly,
    limit,
  };
}

function routeApiKey(): string {
  const key = String(
    Deno.env.get('GOOGLE_ROUTES_API_KEY') || '',
  ).trim();
  if (!key) {
    throw new Error(
      'La búsqueda por ruta no está configurada en el servidor.',
    );
  }
  return key;
}

async function routesRequest<T>(
  path: string,
  body: Record<string, unknown>,
  fieldMask: string,
): Promise<T> {
  const response = await fetch(`${ROUTES_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': routeApiKey(),
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error
        ? String(payload.error.message)
        : `Google Routes devolvió el error ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

function waypoint(point: LatLng) {
  return {
    location: {
      latLng: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
    },
  };
}

async function computeDirectRoute(
  origin: LatLng,
  destination: string,
) {
  const payload = await routesRequest<{
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: {
        encodedPolyline?: string;
      };
      legs?: Array<{
        endLocation?: {
          latLng?: LatLng;
        };
      }>;
    }>;
  }>(
    '/directions/v2:computeRoutes',
    {
      origin: waypoint(origin),
      destination: {
        address: destination,
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      languageCode: 'es-ES',
      regionCode: 'ES',
      units: 'METRIC',
    },
    [
      'routes.distanceMeters',
      'routes.duration',
      'routes.polyline.encodedPolyline',
      'routes.legs.endLocation',
    ].join(','),
  );

  const route = payload.routes?.[0];
  const legs = route?.legs || [];
  const lastLeg = legs.length ? legs[legs.length - 1] : undefined;
  const destinationPoint = lastLeg?.endLocation?.latLng;
  const distanceMeters = Number(route?.distanceMeters);
  const encodedPolyline = String(
    route?.polyline?.encodedPolyline || '',
  );

  if (
    !destinationPoint ||
    !Number.isFinite(destinationPoint.latitude) ||
    !Number.isFinite(destinationPoint.longitude) ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !encodedPolyline
  ) {
    throw new Error(
      'No se ha podido calcular una ruta válida hasta el destino.',
    );
  }

  return {
    destinationPoint,
    distanceMeters,
    durationSeconds: parseDurationSeconds(route?.duration),
    encodedPolyline,
  };
}

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    latitude += (result & 1)
      ? ~(result >> 1)
      : (result >> 1);

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    longitude += (result & 1)
      ? ~(result >> 1)
      : (result >> 1);

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function sampleRoute(points: LatLng[]): LatLng[] {
  if (points.length <= 20) return points;

  const sampled: LatLng[] = [];

  for (let index = 0; index < 20; index++) {
    const sourceIndex = Math.round(
      index * (points.length - 1) / 19,
    );
    sampled.push(points[sourceIndex]);
  }

  return sampled;
}

function stationMatches(
  station: StationView,
  input: RouteInput,
): boolean {
  if (input.openOnly && station.isOpen !== true) {
    return false;
  }

  const query = normalizeSearch(input.stationQuery);
  if (!query) return true;

  const haystack = normalizeSearch(
    [
      station.name,
      station.brand,
      station.address,
      station.city,
      station.province,
    ].join(' '),
  );

  return haystack.includes(query);
}

function routeDistanceToSamples(
  station: StationView,
  samples: LatLng[],
): number {
  const stationPoint = {
    latitude: station.latitude,
    longitude: station.longitude,
  };

  return samples.reduce(
    (minimum, sample) =>
      Math.min(minimum, haversineKm(stationPoint, sample)),
    Number.POSITIVE_INFINITY,
  );
}

async function collectCandidates(
  samples: LatLng[],
  input: RouteInput,
): Promise<CandidateStation[]> {
  const searchRadiusKm = Math.min(
    50,
    Math.max(3, input.maxDetourKm / 2 + 3),
  );

  const snapshots = await Promise.all(
    samples.map((sample) =>
      nearbySnapshot(
        sample.latitude,
        sample.longitude,
        searchRadiusKm,
        100,
      )
    ),
  );

  const byId = new Map<string, CandidateStation>();

  for (const group of snapshots) {
    for (const raw of group) {
      const station = normalizeSnapshot(raw);
      if (!station || !stationMatches(station, input)) continue;

      const roughRouteDistanceKm = routeDistanceToSamples(
        station,
        samples,
      );

      if (
        roughRouteDistanceKm >
        input.maxDetourKm / 2 + 4
      ) {
        continue;
      }

      const candidate: CandidateStation = {
        ...station,
        roughRouteDistanceKm,
      };

      const existing = byId.get(station.id);
      if (
        !existing ||
        roughRouteDistanceKm < existing.roughRouteDistanceKm
      ) {
        byId.set(station.id, candidate);
      }
    }
  }

  const candidates = [...byId.values()].filter((station) =>
    station.fuels.some((fuel) => fuel.key === input.fuelKey)
  );

  candidates.sort((a, b) => {
    const aPrice =
      a.fuels.find((fuel) => fuel.key === input.fuelKey)?.price ??
      99;
    const bPrice =
      b.fuels.find((fuel) => fuel.key === input.fuelKey)?.price ??
      99;

    const aRough =
      aPrice + a.roughRouteDistanceKm * input.consumption / 100;
    const bRough =
      bPrice + b.roughRouteDistanceKm * input.consumption / 100;

    return aRough - bRough;
  });

  return candidates.slice(0, MAX_MATRIX_CANDIDATES);
}

async function computeMatrix(points: LatLng[]) {
  const origins = points.map((point) => ({
    waypoint: waypoint(point),
    routeModifiers: {
      avoidFerries: false,
      avoidHighways: false,
      avoidTolls: false,
    },
  }));

  const destinations = points.map((point) => ({
    waypoint: waypoint(point),
  }));

  const payload = await routesRequest<RouteMatrixElement[]>(
    '/distanceMatrix/v2:computeRouteMatrix',
    {
      origins,
      destinations,
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'es-ES',
      regionCode: 'ES',
      units: 'METRIC',
    },
    [
      'originIndex',
      'destinationIndex',
      'status',
      'condition',
      'distanceMeters',
      'duration',
    ].join(','),
  );

  const matrix = new Map<string, {
    distanceMeters: number;
    durationSeconds: number;
  }>();

  for (const element of payload) {
    const originIndex = Number(element.originIndex);
    const destinationIndex = Number(element.destinationIndex);
    const distanceMeters = Number(element.distanceMeters);
    const statusCode = Number(element.status?.code || 0);
    const condition = String(element.condition || '');

    if (
      !Number.isInteger(originIndex) ||
      !Number.isInteger(destinationIndex) ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0 ||
      statusCode !== 0 ||
      (condition && condition !== 'ROUTE_EXISTS')
    ) {
      continue;
    }

    matrix.set(`${originIndex}:${destinationIndex}`, {
      distanceMeters,
      durationSeconds: parseDurationSeconds(element.duration),
    });
  }

  return matrix;
}

function matrixValue(
  matrix: Map<string, {
    distanceMeters: number;
    durationSeconds: number;
  }>,
  originIndex: number,
  destinationIndex: number,
) {
  return matrix.get(`${originIndex}:${destinationIndex}`) || null;
}

function appliedDiscount(
  station: StationView,
  fuelKey: FuelKey,
  basePrice: number,
  rules: DiscountRule[],
): number {
  const haystack = normalizeSearch(
    `${station.name} ${station.brand} ${station.address}`,
  );

  return rules.reduce((sum, rule) => {
    if (
      rule.fuelKey &&
      rule.fuelKey !== 'all' &&
      rule.fuelKey !== fuelKey
    ) {
      return sum;
    }

    const stationMatch = normalizeSearch(
      String(rule.stationMatch || ''),
    );

    if (stationMatch && !haystack.includes(stationMatch)) {
      return sum;
    }

    const raw = Math.max(0, Number(rule.value) || 0);
    return sum + (
      rule.type === 'percent'
        ? basePrice * raw / 100
        : raw
    );
  }, 0);
}

function scoreCandidates(
  candidates: CandidateStation[],
  matrix: Map<string, {
    distanceMeters: number;
    durationSeconds: number;
  }>,
  input: RouteInput,
): RouteScoredStation[] {
  const directOut = matrixValue(matrix, 0, 1);
  const directBack = matrixValue(matrix, 1, 0);

  if (!directOut) {
    throw new Error(
      'No se ha podido calcular la distancia directa al destino.',
    );
  }

  if (input.tripMode === 'roundtrip' && !directBack) {
    throw new Error(
      'No se ha podido calcular la ruta de vuelta.',
    );
  }

  const directTotalMeters =
    directOut.distanceMeters +
    (
      input.tripMode === 'roundtrip'
        ? directBack?.distanceMeters || 0
        : 0
    );

  const directTotalDuration =
    directOut.durationSeconds +
    (
      input.tripMode === 'roundtrip'
        ? directBack?.durationSeconds || 0
        : 0
    );

  const scored: RouteScoredStation[] = [];

  candidates.forEach((station, candidateIndex) => {
    const pointIndex = candidateIndex + 2;
    const originToStation = matrixValue(matrix, 0, pointIndex);
    const stationToDestination = matrixValue(matrix, pointIndex, 1);

    if (!originToStation || !stationToDestination) return;

    const outboundMeters =
      originToStation.distanceMeters +
      stationToDestination.distanceMeters;
    const outboundDuration =
      originToStation.durationSeconds +
      stationToDestination.durationSeconds;

    let totalMeters = outboundMeters;
    let totalDuration = outboundDuration;
    let stopLeg: 'outbound' | 'return' = 'outbound';

    if (input.tripMode === 'roundtrip') {
      const destinationToStation =
        matrixValue(matrix, 1, pointIndex);
      const stationToOrigin =
        matrixValue(matrix, pointIndex, 0);

      if (!destinationToStation || !stationToOrigin || !directBack) {
        return;
      }

      const stationOnOutboundMeters =
        outboundMeters + directBack.distanceMeters;
      const stationOnOutboundDuration =
        outboundDuration + directBack.durationSeconds;

      const stationOnReturnMeters =
        directOut.distanceMeters +
        destinationToStation.distanceMeters +
        stationToOrigin.distanceMeters;
      const stationOnReturnDuration =
        directOut.durationSeconds +
        destinationToStation.durationSeconds +
        stationToOrigin.durationSeconds;

      if (stationOnReturnMeters < stationOnOutboundMeters) {
        totalMeters = stationOnReturnMeters;
        totalDuration = stationOnReturnDuration;
        stopLeg = 'return';
      } else {
        totalMeters = stationOnOutboundMeters;
        totalDuration = stationOnOutboundDuration;
      }
    }

    const detourKm = Math.max(
      0,
      (totalMeters - directTotalMeters) / 1000,
    );

    if (detourKm > input.maxDetourKm + 0.05) return;

    const basePrice =
      station.fuels.find((fuel) => fuel.key === input.fuelKey)
        ?.price;

    if (!basePrice) return;

    const discount = appliedDiscount(
      station,
      input.fuelKey,
      basePrice,
      input.discounts,
    );
    const price = Math.max(0.001, basePrice - discount);
    const purchasedLiters = input.fullTank
      ? input.tankCapacity
      : input.amount / price;
    const detourLiters =
      detourKm * input.consumption / 100;
    const routeTotalKm = totalMeters / 1000;
    const routeFuelLiters =
      routeTotalKm * input.consumption / 100;
    const netLiters = purchasedLiters - detourLiters;

    if (!Number.isFinite(netLiters) || netLiters <= 0) return;

    const refuelCost = input.fullTank
      ? input.tankCapacity * price
      : input.amount;

    scored.push({
      ...station,
      price,
      basePrice,
      discount,
      directRouteKm: directTotalMeters / 1000,
      routeTotalKm,
      detourKm,
      routeDurationSeconds: totalDuration,
      detourDurationSeconds: Math.max(
        0,
        totalDuration - directTotalDuration,
      ),
      stopLeg,
      purchasedLiters,
      detourLiters,
      routeFuelLiters,
      netLiters,
      effectivePrice: refuelCost / netLiters,
      tripKm: routeTotalKm,
      roadDistanceKm: routeTotalKm,
      distanceKm: detourKm,
      tankCost: input.fullTank ? refuelCost : undefined,
      fullTank: input.fullTank,
    });
  });

  scored.sort(
    (a, b) =>
      a.effectivePrice - b.effectivePrice ||
      a.detourKm - b.detourKm ||
      a.price - b.price,
  );

  return scored;
}

function saving(
  best: RouteScoredStation,
  reference: RouteScoredStation,
): number {
  if (best.id === reference.id) return 0;
  return Math.max(
    0,
    (reference.effectivePrice - best.effectivePrice) *
      best.netLiters,
  );
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;

  if (req.method !== 'POST') {
    return jsonResponse(
      req,
      { ok: false, error: 'Método no permitido.' },
      405,
    );
  }

  const originError = requireTrustedOrigin(req);
  if (originError) return originError;

  const session = await requireDeviceSession(req);
  if ('response' in session) return session.response;

  try {
    const allowed = await enforceRateLimit(
      `route-recommend:${session.payload.sub}`,
      15,
      60,
    );

    if (!allowed) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            'Has realizado demasiadas búsquedas por ruta. Espera un minuto.',
        },
        429,
      );
    }

    const raw = await readJsonBody<Record<string, unknown>>(
      req,
      40_000,
    );
    const input = validateInput(raw);
    const origin = {
      latitude: input.latitude,
      longitude: input.longitude,
    };

    const direct = await computeDirectRoute(
      origin,
      input.destination,
    );

    const decoded = decodePolyline(direct.encodedPolyline);
    const samples = sampleRoute([
      origin,
      ...decoded,
      direct.destinationPoint,
    ]);

    const candidates = await collectCandidates(samples, input);

    if (!candidates.length) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            'No hay gasolineras compatibles cerca de la ruta y dentro del desvío seleccionado.',
        },
        404,
      );
    }

    const matrixPoints: LatLng[] = [
      origin,
      direct.destinationPoint,
      ...candidates.map((station) => ({
        latitude: station.latitude,
        longitude: station.longitude,
      })),
    ];

    const matrix = await computeMatrix(matrixPoints);
    const ranked = scoreCandidates(candidates, matrix, input);
    const best = ranked[0] || null;

    if (!best) {
      return jsonResponse(
        req,
        {
          ok: false,
          error:
            'No se ha encontrado una gasolinera rentable dentro del desvío máximo.',
        },
        404,
      );
    }

    const nearest =
      [...ranked].sort(
        (a, b) => a.detourKm - b.detourKm,
      )[0] || best;

    return jsonResponse(req, {
      ok: true,
      mode: input.fullTank ? 'fullTank' : 'amount',
      tripMode: input.tripMode,
      routeBased: true,
      destination: input.destination,
      route: {
        destination: input.destination,
        destinationPoint: direct.destinationPoint,
        directDistanceKm: best.directRouteKm,
        directDurationSeconds: direct.durationSeconds,
        maxDetourKm: input.maxDetourKm,
        encodedPolyline: direct.encodedPolyline,
      },
      items: ranked.slice(0, input.limit),
      best,
      nearest,
      saving: saving(best, nearest),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse(
      req,
      { ok: false, error: safeError(error) },
      400,
    );
  }
});

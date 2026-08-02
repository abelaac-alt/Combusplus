import { extractItems, normalizeStation, type NormalizedStation } from './stations.ts';

const PROVIDER_URL = 'https://api.precioil.es/estaciones/radio';

export interface SearchPoint {
  latitude: number;
  longitude: number;
  radius: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function fetchProviderStations(
  latitude: number,
  longitude: number,
  radius: number,
  limit = 250,
): Promise<NormalizedStation[]> {
  const apiKey = Deno.env.get('PRECIOIL_API_KEY') || '';
  if (!apiKey) throw new Error('PRECIOIL_API_KEY no está configurada en Supabase.');

  const params = new URLSearchParams({
    latitud: clamp(latitude, -90, 90).toFixed(6),
    longitud: clamp(longitude, -180, 180).toFixed(6),
    radio: String(clamp(radius, 0.2, 50)),
    pagina: '1',
    limite: String(clamp(limit, 1, 250)),
    fields: 'current',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${PROVIDER_URL}?${params}`, {
      signal: controller.signal,
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
        'User-Agent': 'CombusplusSupabase/7.0',
      },
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const upstreamMessage = payload && typeof payload === 'object'
        ? String((payload as Record<string, unknown>).message ||
          (payload as Record<string, unknown>).error || '')
        : '';
      throw new Error(upstreamMessage || `Precioil respondió ${upstream.status}.`);
    }
    return extractItems(payload)
      .map(normalizeStation)
      .filter((station): station is NormalizedStation => station !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseSyncPoints(raw: string): SearchPoint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const point = item as Record<string, unknown>;
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      const radius = Number(point.radius || 30);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
      return { latitude, longitude, radius: clamp(radius, 1, 50) };
    })
    .filter((point): point is SearchPoint => point !== null)
    .slice(0, 20);
}

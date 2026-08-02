import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, requireAppToken, response } from '../_shared/security.ts';
import { extractItems, normalizeStation } from '../_shared/stations.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PRECIOIL_API_KEY = Deno.env.get('PRECIOIL_API_KEY') || '';
const CACHE_MINUTES = Number(Deno.env.get('CACHE_MINUTES') || '15');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function numberParam(url: URL, name: string, min: number, max: number): number | null {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

async function enforceRateLimit(req: Request): Promise<Response | null> {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const token = req.headers.get('x-combusplus-token') || '';
  const { data, error } = await supabase.rpc('combusplus_check_rate_limit', {
    p_key: `${forwarded}:${token}`,
    p_limit: 90,
    p_window_seconds: 60,
  });
  if (error || data !== true) return response(req, { error: 'Demasiadas solicitudes. Espera un minuto.' }, 429);
  return null;
}

async function fetchPrecioil(latitude: number, longitude: number, radius: number, limit: number) {
  if (!PRECIOIL_API_KEY) throw new Error('PRECIOIL_API_KEY no está configurada en Supabase.');
  const params = new URLSearchParams({
    latitud: latitude.toFixed(6), longitud: longitude.toFixed(6), radio: String(radius),
    pagina: '1', limite: String(limit), fields: 'current',
  });
  const upstream = await fetch(`https://api.precioil.es/estaciones/radio?${params}`, {
    headers: { 'X-API-Key': PRECIOIL_API_KEY, Accept: 'application/json', 'User-Agent': 'CombusplusSupabase/6.0' },
  });
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new Error(payload?.message || payload?.error || `Precioil respondió ${upstream.status}.`);
  const normalized = extractItems(payload).map(normalizeStation).filter(Boolean);
  if (normalized.length) {
    const { error } = await supabase.rpc('combusplus_store_station_batch', { p_stations: normalized, p_observed_at: new Date().toISOString() });
    if (error) throw new Error(`No se pudo guardar el histórico: ${error.message}`);
  }
  return normalized;
}

async function loadFromDatabase(latitude: number, longitude: number, radius: number, limit: number) {
  const { data, error } = await supabase.rpc('combusplus_nearby_snapshot', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_km: radius,
    p_limit: limit,
  });
  if (error) throw new Error(`No se pudo leer la caché segura: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'GET') return response(req, { error: 'Método no permitido.' }, 405);
  const authError = requireAppToken(req); if (authError) return authError;
  const rateError = await enforceRateLimit(req); if (rateError) return rateError;

  const url = new URL(req.url);
  if (url.searchParams.get('health') === '1') return response(req, { ok: true, service: 'combusplus', version: '6.0.0' });
  const latitude = numberParam(url, 'latitud', -90, 90);
  const longitude = numberParam(url, 'longitud', -180, 180);
  const radius = numberParam(url, 'radio', 0.2, 50);
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limite') || 250)));
  if (latitude == null || longitude == null || radius == null) return response(req, { error: 'Ubicación o radio no válidos.' }, 400);

  try {
    let items = await loadFromDatabase(latitude, longitude, radius, limit);
    const newest = items.reduce((latest, item: any) => Math.max(latest, Date.parse(item.fechaActualizacion || '') || 0), 0);
    const stale = !newest || Date.now() - newest > CACHE_MINUTES * 60_000;
    if (!items.length || stale) {
      await fetchPrecioil(latitude, longitude, radius, limit);
      items = await loadFromDatabase(latitude, longitude, radius, limit);
    }
    return response(req, { ok: true, items, count: items.length, cachedAt: new Date().toISOString() });
  } catch (error) {
    return response(req, { error: error instanceof Error ? error.message : 'Error interno.' }, 502);
  }
});

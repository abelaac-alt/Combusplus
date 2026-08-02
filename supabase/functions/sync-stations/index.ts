import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, requireSyncToken, response } from '../_shared/security.ts';
import { extractItems, normalizeStation } from '../_shared/stations.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const PRECIOIL_API_KEY = Deno.env.get('PRECIOIL_API_KEY') || '';

interface Point { latitude: number; longitude: number; radius?: number }

async function syncPoint(point: Point) {
  const radius = Math.min(50, Math.max(1, Number(point.radius || 30)));
  const params = new URLSearchParams({
    latitud: Number(point.latitude).toFixed(6), longitud: Number(point.longitude).toFixed(6), radio: String(radius),
    pagina: '1', limite: '250', fields: 'current',
  });
  const upstream = await fetch(`https://api.precioil.es/estaciones/radio?${params}`, {
    headers: { 'X-API-Key': PRECIOIL_API_KEY, Accept: 'application/json', 'User-Agent': 'CombusplusSupabaseSync/6.0' },
  });
  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new Error(payload?.message || `Precioil respondió ${upstream.status}`);
  const normalized = extractItems(payload).map(normalizeStation).filter(Boolean);
  const { data, error } = await supabase.rpc('combusplus_store_station_batch', { p_stations: normalized, p_observed_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return Number(data || normalized.length);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return response(req, { error: 'Método no permitido.' }, 405);
  const authError = requireSyncToken(req); if (authError) return authError;
  if (!PRECIOIL_API_KEY) return response(req, { error: 'PRECIOIL_API_KEY no configurada.' }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    let points: Point[] = Array.isArray(body.points) ? body.points : [];
    if (!points.length) {
      try { points = JSON.parse(Deno.env.get('SYNC_POINTS_JSON') || '[]'); } catch { points = []; }
    }
    if (!points.length) return response(req, { error: 'No hay puntos de sincronización configurados.' }, 400);
    let stored = 0;
    for (const point of points.slice(0, 20)) stored += await syncPoint(point);
    return response(req, { ok: true, stored, points: points.length, syncedAt: new Date().toISOString() });
  } catch (error) {
    return response(req, { error: error instanceof Error ? error.message : 'Error interno.' }, 502);
  }
});

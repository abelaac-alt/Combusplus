import { clientIdentity, jsonResponse, preflight, requireAppToken, safeError } from '../_shared/security.ts';
import { enforceRateLimit, nearbySnapshot, storeStations } from '../_shared/database.ts';
import { fetchProviderStations } from '../_shared/provider.ts';

function numberParam(url: URL, name: string, min: number, max: number): number | null {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'GET') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);

  const authError = requireAppToken(req);
  if (authError) return authError;

  try {
    const rateLimit = Number(Deno.env.get('RATE_LIMIT_PER_MINUTE') || '90');
    const allowed = await enforceRateLimit(clientIdentity(req), Math.max(10, Math.min(rateLimit, 300)));
    if (!allowed) return jsonResponse(req, { ok: false, error: 'Demasiadas solicitudes. Espera un minuto.' }, 429);

    const url = new URL(req.url);
    const latitude = numberParam(url, 'latitud', -90, 90);
    const longitude = numberParam(url, 'longitud', -180, 180);
    const radius = numberParam(url, 'radio', 0.2, 50);
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limite') || 250)));
    if (latitude == null || longitude == null || radius == null) {
      return jsonResponse(req, { ok: false, error: 'Ubicación o radio no válidos.' }, 400);
    }

    let items = await nearbySnapshot(latitude, longitude, radius, limit);
    const newest = items.reduce((latest, item) => {
      const value = Date.parse(String(item.fechaActualizacion || '')) || 0;
      return Math.max(latest, value);
    }, 0);
    const cacheMinutes = Math.max(1, Number(Deno.env.get('CACHE_MINUTES') || '15'));
    const stale = !newest || Date.now() - newest > cacheMinutes * 60_000;
    let refreshed = false;
    let upstreamWarning: string | null = null;

    if (!items.length || stale) {
      try {
        const normalized = await fetchProviderStations(latitude, longitude, radius, limit);
        await storeStations(normalized);
        items = await nearbySnapshot(latitude, longitude, radius, limit);
        refreshed = true;
      } catch (error) {
        upstreamWarning = safeError(error);
        if (!items.length) throw error;
      }
    }

    return jsonResponse(req, {
      ok: true,
      version: '7.0.0',
      items,
      count: items.length,
      cache: {
        stale,
        refreshed,
        newestAt: newest ? new Date(newest).toISOString() : null,
        warning: upstreamWarning,
      },
      generatedAt: new Date().toISOString(),
    }, 200, 'private, max-age=30');
  } catch (error) {
    return jsonResponse(req, { ok: false, error: safeError(error) }, 502);
  }
});

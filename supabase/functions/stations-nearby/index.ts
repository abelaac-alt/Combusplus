import { enforceRateLimit, nearbySnapshot } from '../_shared/database.ts';
import { requireDeviceSession } from '../_shared/session.ts';
import {
  jsonResponse,
  preflight,
  requireTrustedOrigin,
  safeError,
} from '../_shared/security.ts';

function numberParam(url: URL, name: string, min: number, max: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw == null || !raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'GET') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireDeviceSession(req);
  if ('response' in session) return session.response;

  try {
    const rateLimit = Math.max(20, Math.min(Number(Deno.env.get('RATE_LIMIT_PER_MINUTE') || 90), 300));
    const allowed = await enforceRateLimit(`stations:${session.payload.sub}`, rateLimit, 60);
    if (!allowed) return jsonResponse(req, { ok: false, error: 'Demasiadas solicitudes. Espera un minuto.' }, 429);

    const url = new URL(req.url);
    const latitude = numberParam(url, 'latitud', -90, 90);
    const longitude = numberParam(url, 'longitud', -180, 180);
    const radius = numberParam(url, 'radio', 0.2, 50);
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limite') || 250)));
    if (latitude == null || longitude == null || radius == null) {
      return jsonResponse(req, { ok: false, error: 'Ubicación o radio no válidos.' }, 400);
    }

    const items = await nearbySnapshot(latitude, longitude, radius, limit);
    const newest = items.reduce((latest, item) => {
      const value = Date.parse(String(item.fechaActualizacion || '')) || 0;
      return Math.max(latest, value);
    }, 0);
    const cacheMinutes = Math.max(1, Number(Deno.env.get('CACHE_MINUTES') || 15));
    const stale = !newest || Date.now() - newest > cacheMinutes * 60_000;

    return jsonResponse(req, {
      ok: true,
      version: '10.6.3',
      items,
      count: items.length,
      cache: {
        stale,
        newestAt: newest ? new Date(newest).toISOString() : null,
      },
      generatedAt: new Date().toISOString(),
    }, 200, 'private, max-age=30');
  } catch (error) {
    return jsonResponse(req, { ok: false, error: safeError(error) }, 500);
  }
});

import { clientIdentity, jsonResponse, preflight, requireAppToken, safeError } from '../_shared/security.ts';
import { enforceRateLimit, stationHistory } from '../_shared/database.ts';

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'GET') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);

  const authError = requireAppToken(req);
  if (authError) return authError;

  try {
    const allowed = await enforceRateLimit(`${clientIdentity(req)}:history`, 60);
    if (!allowed) return jsonResponse(req, { ok: false, error: 'Demasiadas solicitudes.' }, 429);

    const url = new URL(req.url);
    const stationId = String(url.searchParams.get('stationId') || '').trim().slice(0, 200);
    const fuelKey = String(url.searchParams.get('fuelKey') || '').trim().slice(0, 60);
    const hours = Math.min(8760, Math.max(1, Number(url.searchParams.get('hours') || 168)));
    const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    if (!stationId || !fuelKey) {
      return jsonResponse(req, { ok: false, error: 'Faltan stationId o fuelKey.' }, 400);
    }

    const items = await stationHistory(stationId, fuelKey, hours, limit);
    const first = items[0] as Record<string, unknown> | undefined;
    const last = items[items.length - 1] as Record<string, unknown> | undefined;
    const firstPrice = Number(first?.price);
    const lastPrice = Number(last?.price);
    const change = Number.isFinite(firstPrice) && Number.isFinite(lastPrice)
      ? lastPrice - firstPrice
      : 0;

    return jsonResponse(req, {
      ok: true,
      stationId,
      fuelKey,
      hours,
      items,
      summary: {
        count: items.length,
        firstPrice: Number.isFinite(firstPrice) ? firstPrice : null,
        lastPrice: Number.isFinite(lastPrice) ? lastPrice : null,
        change,
        trend: change > 0.0005 ? 'up' : change < -0.0005 ? 'down' : 'stable',
      },
    }, 200, 'private, max-age=60');
  } catch (error) {
    return jsonResponse(req, { ok: false, error: safeError(error) }, 500);
  }
});

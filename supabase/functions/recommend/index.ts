import { enforceRateLimit, nearbySnapshot } from '../_shared/database.ts';
import { buildRecommendation, validateRecommendationInput } from '../_shared/recommendation.ts';
import { requireDeviceSession } from '../_shared/session.ts';
import { jsonResponse, preflight, readJsonBody, requireTrustedOrigin, safeError } from '../_shared/security.ts';

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireDeviceSession(req);
  if ('response' in session) return session.response;

  try {
    const allowed = await enforceRateLimit(`recommend:${session.payload.sub}`, 60, 60);
    if (!allowed) return jsonResponse(req, { ok: false, error: 'Demasiadas búsquedas. Espera un minuto.' }, 429);
    const raw = await readJsonBody<Record<string, unknown>>(req, 30_000);
    const input = validateRecommendationInput(raw);
    const snapshot = await nearbySnapshot(input.latitude, input.longitude, input.radius, 250);
    if (!snapshot.length) {
      return jsonResponse(req, { ok: false, error: 'Todavía no hay precios actualizados para esta zona.' }, 503);
    }
    const result = buildRecommendation(snapshot, input);
    if (!result.best) {
      return jsonResponse(req, { ok: false, error: 'No hay gasolineras compatibles con estos datos.' }, 404);
    }
    return jsonResponse(req, {
      ok: true,
      mode: input.fullTank ? 'fullTank' : 'amount',
      tripMode: input.tripMode,
      ...result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse(req, { ok: false, error: safeError(error) }, 400);
  }
});

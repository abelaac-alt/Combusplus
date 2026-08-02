import { finishSyncRun, startSyncRun, storeStations } from '../_shared/database.ts';
import { fetchProviderStations, parseSyncPoints, type SearchPoint } from '../_shared/provider.ts';
import { jsonResponse, preflight, requireSyncToken, safeError } from '../_shared/security.ts';

interface SyncBody {
  source?: string;
  points?: SearchPoint[];
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);

  const authError = requireSyncToken(req);
  if (authError) return authError;

  let runId = 0;
  let received = 0;
  let stored = 0;
  try {
    const body = await req.json().catch(() => ({})) as SyncBody;
    const configured = parseSyncPoints(Deno.env.get('SYNC_POINTS_JSON') || '[]');
    const requested = Array.isArray(body.points)
      ? parseSyncPoints(JSON.stringify(body.points))
      : configured;
    if (!requested.length) {
      return jsonResponse(req, { ok: false, error: 'No hay puntos de sincronización configurados.' }, 400);
    }

    const source = String(body.source || 'manual').slice(0, 40);
    runId = await startSyncRun(source, requested.length, {
      userAgent: req.headers.get('user-agent') || null,
    });

    const pointResults: Record<string, unknown>[] = [];
    for (const point of requested) {
      try {
        const stations = await fetchProviderStations(
          point.latitude,
          point.longitude,
          Number(point.radius || 30),
          250,
        );
        const storedAtPoint = await storeStations(stations);
        received += stations.length;
        stored += storedAtPoint;
        pointResults.push({ ...point, ok: true, received: stations.length, stored: storedAtPoint });
      } catch (error) {
        pointResults.push({ ...point, ok: false, error: safeError(error) });
      }
    }

    const succeeded = pointResults.some((result) => result.ok === true);
    await finishSyncRun(
      runId,
      succeeded ? 'succeeded' : 'failed',
      received,
      stored,
      succeeded ? null : 'No se pudo sincronizar ningún punto.',
      { pointResults },
    );

    return jsonResponse(req, {
      ok: succeeded,
      runId,
      received,
      stored,
      points: pointResults,
      syncedAt: new Date().toISOString(),
    }, succeeded ? 200 : 502);
  } catch (error) {
    const message = safeError(error);
    if (runId) {
      try {
        await finishSyncRun(runId, 'failed', received, stored, message);
      } catch {
        // La respuesta principal conserva el error original.
      }
    }
    return jsonResponse(req, { ok: false, error: message, runId: runId || null }, 502);
  }
});

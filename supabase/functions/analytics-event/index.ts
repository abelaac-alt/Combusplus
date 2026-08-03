import { supabaseAdmin } from '../_shared/database.ts';
import { requireDeviceSession } from '../_shared/session.ts';
import { jsonResponse, preflight, readJsonBody, requireTrustedOrigin } from '../_shared/security.ts';

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;
  const session = await requireDeviceSession(req);
  if ('response' in session) return session.response;

  try {
    const body = await readJsonBody<Record<string, any>>(req, 12_000);
    const device = body.device && typeof body.device === 'object' ? body.device : {};
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const event = String(body.event || '').trim().slice(0, 80);
    if (!/^[a-z0-9_.-]{2,80}$/i.test(event)) {
      return jsonResponse(req, { ok: false, error: 'Evento no válido.' }, 400);
    }
    const { error } = await supabaseAdmin.rpc('combusplus_track_analytics', {
      p_installation_hash: session.payload.sub,
      p_event_name: event,
      p_page_name: String(body.page || '').slice(0, 40),
      p_platform: String(device.platform || session.payload.platform || '').slice(0, 30),
      p_device_family: String(device.deviceFamily || '').slice(0, 80),
      p_app_version: String(device.appVersion || session.payload.appVersion || '').slice(0, 30),
      p_city_approx: String(body.cityApprox || '').slice(0, 80),
      p_metadata: metadata
    });
    if (error) throw error;
    return jsonResponse(req, { ok: true }, 200);
  } catch {
    return jsonResponse(req, { ok: false, error: 'No se pudo registrar la estadística.' }, 400);
  }
});

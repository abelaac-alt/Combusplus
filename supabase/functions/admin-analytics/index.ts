import { supabaseAdmin } from '../_shared/database.ts';
import { jsonResponse, preflight, requireTrustedOrigin } from '../_shared/security.ts';

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;

  if (req.method !== 'GET') {
    return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  }

  const originError = requireTrustedOrigin(req);
  if (originError) return originError;

  const expected = Deno.env.get('ADMIN_DASHBOARD_TOKEN') || '';
  const received = req.headers.get('x-combusplus-admin') || '';

  if (!safeEqual(expected, received)) {
    return jsonResponse(req, { ok: false, error: 'Token de administrador incorrecto.' }, 401);
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('combusplus_admin_analytics_summary');
    if (error) throw error;

    const payload = data && typeof data === 'object' ? data : {};
    return jsonResponse(req, { ok: true, ...payload }, 200, 'no-store');
  } catch (error) {
    console.error('admin-analytics:', error);
    return jsonResponse(req, { ok: false, error: 'No se pudo cargar el panel.' }, 500);
  }
});

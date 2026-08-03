import {
  enforceRateLimit,
  logSecurityEvent,
  supabaseAdmin,
} from '../_shared/database.ts';
import {
  jsonResponse,
  preflight,
  rateIdentity,
  requestOrigin,
} from '../_shared/security.ts';

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function adminOrigin(): string {
  return (Deno.env.get('ADMIN_ALLOWED_ORIGIN') || 'https://abelaac-alt.github.io')
    .trim()
    .replace(/\/$/, '');
}

Deno.serve(async (req) => {
  const origin = requestOrigin(req);

  // El panel administrativo solo se acepta desde el origen web configurado.
  if (!origin || origin !== adminOrigin()) {
    return jsonResponse(req, { ok: false, error: 'Acceso no autorizado.' }, 403);
  }

  const options = preflight(req);
  if (options) return options;

  if (req.method !== 'GET') {
    return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  }

  try {
    const allowed = await enforceRateLimit(
      await rateIdentity(req, 'admin-analytics'),
      12,
      300,
    );
    if (!allowed) {
      await logSecurityEvent({
        eventType: 'admin_rate_limited',
        severity: 'warning',
      });
      return jsonResponse(req, { ok: false, error: 'Demasiados intentos.' }, 429);
    }

    const expected = Deno.env.get('ADMIN_DASHBOARD_TOKEN') || '';
    const received = req.headers.get('x-combusplus-admin') || '';

    if (!safeEqual(expected, received)) {
      await logSecurityEvent({
        eventType: 'admin_auth_failed',
        severity: 'warning',
      });
      return jsonResponse(req, { ok: false, error: 'Acceso no autorizado.' }, 401);
    }

    const { data, error } = await supabaseAdmin.rpc(
      'combusplus_admin_analytics_summary',
    );
    if (error) throw error;

    const payload = data && typeof data === 'object' ? data : {};
    return jsonResponse(req, { ok: true, ...payload }, 200, 'no-store');
  } catch (error) {
    console.error('admin-analytics:', error);
    return jsonResponse(
      req,
      { ok: false, error: 'No se pudo cargar el panel.' },
      500,
    );
  }
});

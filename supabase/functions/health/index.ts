import { jsonResponse, preflight } from '../_shared/security.ts';

Deno.serve((req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'GET') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);

  return jsonResponse(req, {
    ok: true,
    service: 'Combusplus Backend',
    version: '7.0.0',
    time: new Date().toISOString(),
    providerKeyConfigured: Boolean(Deno.env.get('PRECIOIL_API_KEY')),
    cacheMinutes: Number(Deno.env.get('CACHE_MINUTES') || '15'),
  }, 200, 'public, max-age=60');
});

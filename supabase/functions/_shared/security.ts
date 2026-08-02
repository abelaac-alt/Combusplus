export const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') || 'https://abelaac-alt.github.io,https://appassets.androidplatform.net';
  return configured.split(',').map((value) => value.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = allowedOrigins();
  const selected = allowed.includes(origin) ? origin : allowed[0] || 'https://abelaac-alt.github.io';
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-combusplus-token, x-combusplus-sync',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

export function response(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...corsHeaders(req), 'cache-control': 'no-store' } });
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const length = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < length; i++) diff |= (aa[i % Math.max(aa.length, 1)] || 0) ^ (bb[i % Math.max(bb.length, 1)] || 0);
  return diff === 0;
}

export function requireAppToken(req: Request): Response | null {
  const expected = Deno.env.get('APP_ACCESS_TOKEN') || '';
  const received = req.headers.get('x-combusplus-token') || '';
  if (!expected || !received || !constantTimeEqual(expected, received)) return response(req, { error: 'Acceso no autorizado.' }, 401);
  return null;
}

export function requireSyncToken(req: Request): Response | null {
  const expected = Deno.env.get('SYNC_SECRET') || '';
  const received = req.headers.get('x-combusplus-sync') || '';
  if (!expected || !received || !constantTimeEqual(expected, received)) return response(req, { error: 'Acceso de sincronización no autorizado.' }, 401);
  return null;
}

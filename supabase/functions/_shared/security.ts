export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ||
    'https://abelaac-alt.github.io,https://appassets.androidplatform.net';
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = allowedOrigins();
  const selected = allowed.includes(origin) ? origin : allowed[0] || 'null';
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-headers':
      'authorization, apikey, content-type, x-combusplus-token, x-combusplus-sync',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  cacheControl = 'no-store',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...corsHeaders(req),
      'cache-control': cacheControl,
    },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const length = Math.max(aa.length, bb.length, 1);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (aa[i % Math.max(aa.length, 1)] || 0) ^
      (bb[i % Math.max(bb.length, 1)] || 0);
  }
  return diff === 0;
}

export function requireAppToken(req: Request): Response | null {
  const required = (Deno.env.get('REQUIRE_APP_TOKEN') || 'true').toLowerCase() !== 'false';
  if (!required) return null;
  const expected = Deno.env.get('APP_ACCESS_TOKEN') || '';
  const received = req.headers.get('x-combusplus-token') || '';
  if (!expected || !received || !constantTimeEqual(expected, received)) {
    return jsonResponse(req, { ok: false, error: 'Acceso no autorizado.' }, 401);
  }
  return null;
}

export function requireSyncToken(req: Request): Response | null {
  const expected = Deno.env.get('SYNC_SECRET') || '';
  const received = req.headers.get('x-combusplus-sync') || '';
  if (!expected || !received || !constantTimeEqual(expected, received)) {
    return jsonResponse(req, { ok: false, error: 'Sincronización no autorizada.' }, 401);
  }
  return null;
}

export function clientIdentity(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const token = req.headers.get('x-combusplus-token') || 'public';
  return `${forwarded || realIp || 'unknown'}:${token.slice(0, 16)}`;
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return 'Error interno.';
}

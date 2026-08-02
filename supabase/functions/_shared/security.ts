import { sha256 } from './encoding.ts';

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
  'cross-origin-resource-policy': 'same-site',
};

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') ||
    'https://abelaac-alt.github.io,https://appassets.androidplatform.net';
  return configured.split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
}

export function requestOrigin(req: Request): string {
  return (req.headers.get('origin') || '').replace(/\/$/, '');
}

export function isAllowedOrigin(origin: string): boolean {
  return !origin || allowedOrigins().includes(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = requestOrigin(req);
  const selected = origin && isAllowedOrigin(origin) ? origin : 'null';
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-headers':
      'authorization, apikey, content-type, x-combusplus-session, x-combusplus-sync, x-installation-id, x-request-id',
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
    headers: { ...JSON_HEADERS, ...corsHeaders(req), 'cache-control': cacheControl },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  if (!isAllowedOrigin(requestOrigin(req))) {
    return new Response(null, { status: 403, headers: corsHeaders(req) });
  }
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function requireTrustedOrigin(req: Request): Response | null {
  const origin = requestOrigin(req);
  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse(req, { ok: false, error: 'Origen no autorizado.' }, 403);
  }
  return null;
}

export async function readJsonBody<T>(req: Request, maxBytes = 24_000): Promise<T> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('La solicitud es demasiado grande.');
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error('La solicitud es demasiado grande.');
  return (text ? JSON.parse(text) : {}) as T;
}

export function requireSyncToken(req: Request): Response | null {
  const expected = Deno.env.get('SYNC_SECRET') || '';
  const received = req.headers.get('x-combusplus-sync') || '';
  if (!expected || !received || expected.length !== received.length) {
    return jsonResponse(req, { ok: false, error: 'Sincronización no autorizada.' }, 401);
  }
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  if (diff !== 0) return jsonResponse(req, { ok: false, error: 'Sincronización no autorizada.' }, 401);
  return null;
}

export async function rateIdentity(req: Request, scope: string, subject = ''): Promise<string> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() || 'unknown';
  const salt = Deno.env.get('RATE_LIMIT_SALT') || '';
  return `${scope}:${await sha256(`${ip}|${subject}|${salt}`)}`;
}

export function safeError(error: unknown): string {
  const expose = (Deno.env.get('EXPOSE_FUNCTION_ERRORS') || 'false').toLowerCase() === 'true';
  if (expose && error instanceof Error) return error.message.slice(0, 300);
  if (error instanceof SyntaxError) return 'La solicitud contiene JSON no válido.';
  return 'No se pudo completar la operación.';
}

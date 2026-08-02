import {
  base64UrlDecode,
  base64UrlEncode,
  cryptoBuffer,
  decodeUtf8,
  sha256,
  timingSafeEqual,
  utf8,
} from './encoding.ts';
import { jsonResponse } from './security.ts';

export type ClientPlatform = 'web' | 'android' | 'android-auto' | 'android-worker';

export interface SessionPayload {
  iss: 'combusplus';
  aud: 'combusplus-api';
  sub: string;
  platform: ClientPlatform;
  appVersion: string;
  integrity: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

let cachedKey: CryptoKey | null = null;

async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secret = Deno.env.get('DEVICE_TOKEN_SECRET') || '';
  if (secret.length < 32) throw new Error('DEVICE_TOKEN_SECRET no está configurado correctamente.');
  cachedKey = await crypto.subtle.importKey(
    'raw',
    cryptoBuffer(utf8(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return cachedKey;
}

export async function installationHash(installationId: string): Promise<string> {
  const salt = Deno.env.get('RATE_LIMIT_SALT') || Deno.env.get('DEVICE_TOKEN_SECRET') || '';
  return sha256(`${installationId}|${salt}`);
}

export async function issueSessionToken(input: {
  installationHash: string;
  platform: ClientPlatform;
  appVersion: string;
  integrity: string;
}): Promise<{ token: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.min(
    30 * 24 * 60 * 60,
    Math.max(60 * 60, Number(Deno.env.get('DEVICE_TOKEN_TTL_SECONDS') || 7 * 24 * 60 * 60)),
  );
  const payload: SessionPayload = {
    iss: 'combusplus',
    aud: 'combusplus-api',
    sub: input.installationHash,
    platform: input.platform,
    appVersion: input.appVersion.slice(0, 30),
    integrity: input.integrity.slice(0, 40),
    tokenVersion: Number(Deno.env.get('DEVICE_TOKEN_VERSION') || 1),
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'v1' })));
  const body = base64UrlEncode(utf8(JSON.stringify(payload)));
  const unsigned = `${header}.${body}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await signingKey(), cryptoBuffer(utf8(unsigned))),
  );
  return {
    token: `${unsigned}.${base64UrlEncode(signature)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const [headerPart, bodyPart, signaturePart, extra] = token.split('.');
    if (!headerPart || !bodyPart || !signaturePart || extra) return null;
    const unsigned = `${headerPart}.${bodyPart}`;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      cryptoBuffer(base64UrlDecode(signaturePart)),
      cryptoBuffer(utf8(unsigned)),
    );
    if (!valid) return null;
    const header = JSON.parse(decodeUtf8(base64UrlDecode(headerPart))) as Record<string, unknown>;
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const payload = JSON.parse(decodeUtf8(base64UrlDecode(bodyPart))) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== 'combusplus' || payload.aud !== 'combusplus-api') return null;
    if (!payload.sub || payload.exp <= now || payload.iat > now + 60) return null;
    if (payload.tokenVersion !== Number(Deno.env.get('DEVICE_TOKEN_VERSION') || 1)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireDeviceSession(
  req: Request,
): Promise<{ payload: SessionPayload } | { response: Response }> {
  const token = req.headers.get('x-combusplus-session') || '';
  const installationId = req.headers.get('x-installation-id') || '';
  if (!token || !installationId) {
    return { response: jsonResponse(req, { ok: false, error: 'Sesión de instalación no disponible.' }, 401) };
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    return { response: jsonResponse(req, { ok: false, error: 'La sesión ha caducado o no es válida.' }, 401) };
  }
  const actualHash = await installationHash(installationId);
  if (!timingSafeEqual(actualHash, payload.sub)) {
    return { response: jsonResponse(req, { ok: false, error: 'La sesión no pertenece a esta instalación.' }, 401) };
  }
  return { payload };
}

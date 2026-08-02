import { base64UrlEncode, utf8 } from './encoding.ts';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface IntegrityResult {
  accepted: boolean;
  level: 'web' | 'off' | 'not-configured' | 'missing' | 'play-recognized' | 'device-integrity' | 'strong-integrity' | 'rejected';
  reason?: string;
}

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

function mode(): 'off' | 'optional' | 'enforce' {
  const value = (Deno.env.get('PLAY_INTEGRITY_MODE') || 'optional').toLowerCase();
  return value === 'enforce' ? 'enforce' : value === 'off' ? 'off' : 'optional';
}

function pemToPkcs8(pem: string): Uint8Array {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(clean);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function googleAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64UrlEncode(utf8(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/playintegrity',
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(unsigned)));
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') throw new Error('No se pudo autenticar Play Integrity.');
  cachedAccessToken = body.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(300, Number(body.expires_in || 3600) - 60) * 1000;
  return cachedAccessToken;
}

export async function verifyPlayIntegrity(input: {
  platform: string;
  integrityToken?: string;
  requestHash?: string;
}): Promise<IntegrityResult> {
  if (input.platform === 'web') return { accepted: true, level: 'web' };
  const currentMode = mode();
  if (currentMode === 'off') return { accepted: true, level: 'off' };

  const rawAccount = Deno.env.get('PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON') || '';
  const packageName = Deno.env.get('PLAY_INTEGRITY_PACKAGE_NAME') || 'com.grupomds.combusplus';
  if (!rawAccount) {
    return currentMode === 'enforce'
      ? { accepted: false, level: 'rejected', reason: 'Play Integrity no está configurado.' }
      : { accepted: true, level: 'not-configured' };
  }
  if (!input.integrityToken || !input.requestHash) {
    return currentMode === 'enforce'
      ? { accepted: false, level: 'rejected', reason: 'Falta la validación de integridad.' }
      : { accepted: true, level: 'missing' };
  }

  try {
    const account = JSON.parse(rawAccount) as ServiceAccount;
    const accessToken = await googleAccessToken(account);
    const response = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ integrity_token: input.integrityToken }),
      },
    );
    const decoded = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) throw new Error('Google Play rechazó el token de integridad.');
    const payload = decoded.tokenPayloadExternal || {};
    const requestDetails = payload.requestDetails || {};
    const appIntegrity = payload.appIntegrity || {};
    const deviceIntegrity = payload.deviceIntegrity || {};
    const accountDetails = payload.accountDetails || {};
    const deviceVerdicts: string[] = Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
      ? deviceIntegrity.deviceRecognitionVerdict : [];

    const validPackage = requestDetails.requestPackageName === packageName;
    const validHash = requestDetails.requestHash === input.requestHash;
    const recognized = appIntegrity.appRecognitionVerdict === 'PLAY_RECOGNIZED';
    const licensed = accountDetails.appLicensingVerdict === 'LICENSED';
    const device = deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY');
    const strong = deviceVerdicts.includes('MEETS_STRONG_INTEGRITY');
    const accepted = validPackage && validHash && recognized && device && (currentMode !== 'enforce' || licensed);
    if (!accepted) {
      return currentMode === 'enforce'
        ? { accepted: false, level: 'rejected', reason: 'La instalación no superó la validación de Google Play.' }
        : { accepted: true, level: 'rejected' };
    }
    return { accepted: true, level: strong ? 'strong-integrity' : 'device-integrity' };
  } catch (error) {
    return currentMode === 'enforce'
      ? { accepted: false, level: 'rejected', reason: error instanceof Error ? error.message : 'Error de Play Integrity.' }
      : { accepted: true, level: 'rejected' };
  }
}

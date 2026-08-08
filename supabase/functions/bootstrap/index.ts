import { enforceRateLimit, logSecurityEvent, registerInstallation } from '../_shared/database.ts';
import { verifyPlayIntegrity } from '../_shared/integrity.ts';
import { installationHash, issueSessionToken, type ClientPlatform } from '../_shared/session.ts';
import {
  jsonResponse,
  preflight,
  rateIdentity,
  readJsonBody,
  requireTrustedOrigin,
  safeError,
} from '../_shared/security.ts';

interface BootstrapBody {
  installationId?: string;
  platform?: ClientPlatform;
  appVersion?: string;
  integrityToken?: string;
  requestHash?: string;
}

const PLATFORMS: ClientPlatform[] = ['web', 'android', 'android-auto', 'android-worker'];

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  const originError = requireTrustedOrigin(req);
  if (originError) return originError;

  try {
    const body = await readJsonBody<BootstrapBody>(req, 40_000);
    const installationId = String(body.installationId || '').trim();
    const platform = String(body.platform || 'web') as ClientPlatform;
    const appVersion = String(body.appVersion || 'unknown').trim().slice(0, 30);
    if (!/^[A-Za-z0-9_-]{32,160}$/.test(installationId)) {
      return jsonResponse(req, { ok: false, error: 'Identificador de instalación no válido.' }, 400);
    }
    if (!PLATFORMS.includes(platform)) {
      return jsonResponse(req, { ok: false, error: 'Plataforma no válida.' }, 400);
    }

    const hash = await installationHash(installationId);
    const ipLimit = await enforceRateLimit(await rateIdentity(req, 'bootstrap-ip'), 30, 3600);
    const installLimit = await enforceRateLimit(`bootstrap-install:${hash}`, 20, 3600);
    if (!ipLimit || !installLimit) {
      await logSecurityEvent({ installationHash: hash, eventType: 'bootstrap_rate_limited', severity: 'warning' });
      return jsonResponse(req, { ok: false, error: 'Demasiadas activaciones. Espera antes de repetir.' }, 429);
    }

    const integrity = await verifyPlayIntegrity({
      platform,
      integrityToken: body.integrityToken,
      requestHash: body.requestHash,
    });
    if (!integrity.accepted) {
      await logSecurityEvent({
        installationHash: hash,
        eventType: 'integrity_rejected',
        severity: 'warning',
        metadata: { platform, level: integrity.level },
      });
      return jsonResponse(req, { ok: false, error: integrity.reason || 'Instalación no autorizada.' }, 403);
    }

    const installation = await registerInstallation({
      installationHash: hash,
      platform,
      appVersion,
      integrityLevel: integrity.level,
    });
    if (!installation.allowed) {
      return jsonResponse(req, { ok: false, error: 'Esta instalación está bloqueada.' }, 403);
    }

    const session = await issueSessionToken({
      installationHash: hash,
      platform,
      appVersion,
      integrity: integrity.level,
    });
    return jsonResponse(req, {
      ok: true,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      integrity: integrity.level,
      backendVersion: '10.6.3',
    });
  } catch (error) {
    return jsonResponse(req, { ok: false, error: safeError(error) }, 400);
  }
});

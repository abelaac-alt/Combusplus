import { supabaseAdmin } from '../_shared/database.ts';
import { jsonResponse, preflight } from '../_shared/security.ts';

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;
  if (req.method !== 'GET') return jsonResponse(req, { ok: false, error: 'Método no permitido.' }, 405);
  const expected = Deno.env.get('ADMIN_DASHBOARD_TOKEN') || '';
  const received = req.headers.get('x-combusplus-admin') || '';
  if (!safeEqual(expected, received)) return jsonResponse(req, { ok: false, error: 'Acceso no autorizado.' }, 401);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
  const activeSince = new Date(now.getTime() - 2 * 60_000).toISOString();

  const [eventsDay, eventsMonth, active, presence] = await Promise.all([
    supabaseAdmin.schema('private').from('analytics_events').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo),
    supabaseAdmin.schema('private').from('analytics_events').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
    supabaseAdmin.schema('private').from('analytics_presence').select('*', { count: 'exact', head: true }).gte('last_seen_at', activeSince),
    supabaseAdmin.schema('private').from('analytics_presence')
      .select('installation_hash,platform,device_family,app_version,city_approx,last_seen_at')
      .order('last_seen_at', { ascending: false }).limit(500)
  ]);

  if (presence.error) return jsonResponse(req, { ok: false, error: 'No se pudo cargar el panel.' }, 500);

  const rows = presence.data || [];
  const group = (key: string) => Object.entries(rows.reduce((acc: Record<string, number>, row: any) => {
    const value = String(row[key] || 'Sin datos');
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => Number(b[1]) - Number(a[1]));

  return jsonResponse(req, {
    ok: true,
    generatedAt: now.toISOString(),
    totals: {
      installations: rows.length,
      activeNow: active.count || 0,
      events24h: eventsDay.count || 0,
      events30d: eventsMonth.count || 0
    },
    byPlatform: group('platform'),
    byDevice: group('device_family'),
    byCity: group('city_approx'),
    byVersion: group('app_version'),
    installations: rows.map((row: any) => ({
      installation: String(row.installation_hash || '').slice(0, 12),
      platform: row.platform,
      device: row.device_family,
      version: row.app_version,
      city: row.city_approx,
      lastSeenAt: row.last_seen_at
    }))
  }, 200, 'no-store');
});

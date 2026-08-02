import { createClient } from 'npm:@supabase/supabase-js@2';
import type { NormalizedStation } from './stations.ts';

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function storeStations(
  stations: NormalizedStation[],
  observedAt = new Date().toISOString(),
): Promise<number> {
  if (!stations.length) return 0;
  const { data, error } = await supabaseAdmin.rpc('combusplus_store_station_batch', {
    p_stations: stations,
    p_observed_at: observedAt,
  });
  if (error) throw new Error(`No se pudo guardar el histórico: ${error.message}`);
  return Number(data || 0);
}

export async function nearbySnapshot(
  latitude: number,
  longitude: number,
  radius: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseAdmin.rpc('combusplus_nearby_snapshot', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_km: radius,
    p_limit: limit,
  });
  if (error) throw new Error(`No se pudo leer la caché segura: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export async function stationHistory(
  stationId: string,
  fuelKey: string,
  hours: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseAdmin.rpc('combusplus_station_history', {
    p_station_id: stationId,
    p_fuel_key: fuelKey,
    p_hours: hours,
    p_limit: limit,
  });
  if (error) throw new Error(`No se pudo cargar el histórico: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export async function enforceRateLimit(
  identity: string,
  limit: number,
  seconds = 60,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('combusplus_check_rate_limit', {
    p_key: identity,
    p_limit: limit,
    p_window_seconds: seconds,
  });
  if (error) throw new Error(`Rate limit no disponible: ${error.message}`);
  return data === true;
}

export async function startSyncRun(
  source: string,
  pointsRequested: number,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('combusplus_start_sync_run', {
    p_source: source,
    p_points_requested: pointsRequested,
    p_metadata: metadata,
  });
  if (error) throw new Error(`No se pudo registrar la sincronización: ${error.message}`);
  return Number(data);
}

export async function finishSyncRun(
  id: number,
  status: 'succeeded' | 'failed',
  received: number,
  stored: number,
  errorMessage: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('combusplus_finish_sync_run', {
    p_id: id,
    p_status: status,
    p_received: received,
    p_stored: stored,
    p_error: errorMessage,
    p_metadata: metadata,
  });
  if (error) throw new Error(`No se pudo cerrar la sincronización: ${error.message}`);
}

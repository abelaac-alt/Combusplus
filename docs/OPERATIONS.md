# Operación y mantenimiento

## Ver últimas sincronizaciones

```sql
select *
from private.sync_runs
order by started_at desc
limit 20;
```

## Contar datos almacenados

```sql
select count(*) as stations from private.stations;
select count(*) as latest_prices from private.station_latest_prices;
select count(*) as history_rows from private.station_price_history;
```

## Ver ejecuciones de Cron

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;
```

## Forzar sincronización

Usa la consulta incluida en `docs/INSTALLATION.md` o ejecuta la Edge Function `sync-stations` con el encabezado privado `X-Combusplus-Sync`.

## Retención

Combusplus conserva por defecto tres años de histórico y noventa días de logs de sincronización. El trabajo diario `combusplus-cleanup` realiza la limpieza.

## Rotar la clave Precioil

1. Genera una nueva clave en Precioil.
2. Actualiza `PRECIOIL_API_KEY` en GitHub Secrets.
3. Ejecuta `Desplegar Supabase`.
4. Revoca la clave anterior.

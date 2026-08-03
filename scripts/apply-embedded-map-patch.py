#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "web/index.html"
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"

def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"No se encontró el bloque esperado: {label}")
    return text.replace(old, new, 1)

index = INDEX.read_text(encoding="utf-8")
index = replace_once(
    index,
    '<section class="map-toolbar"><span id="mapModeLabel">Todas las gasolineras</span><button class="switch-btn" id="mapTopTenToggle" type="button" aria-pressed="false">Top 10</button></section>',
    '<section class="map-search-card"><label for="mapSearch">Buscar gasolinera</label><div class="map-search-row"><input id="mapSearch" type="search" placeholder="Nombre, marca, dirección o localidad" autocomplete="off"><button class="secondary-btn compact" id="clearMapSearch" type="button">Borrar</button></div></section><section class="map-toolbar"><span id="mapModeLabel">Todas las gasolineras</span><button class="switch-btn" id="mapTopTenToggle" type="button" aria-pressed="false">Top 10</button></section>',
    "buscador de mapa"
)
INDEX.write_text(index, encoding="utf-8")

styles = STYLES.read_text(encoding="utf-8")
if ".map-search-card{" not in styles:
    styles += '''
.map-search-card{background:#fff;border:1px solid #d8dbe0;padding:14px;margin:0 0 12px}
.map-search-card label{display:block;font-size:.82rem;font-weight:800;margin-bottom:8px}
.map-search-row{display:flex;gap:8px}
.map-search-row input{min-width:0;flex:1;padding:12px;border:1px solid #cdd1d8;border-radius:8px;font:inherit}
.native-shell #googleMap{background:#eef0f3}
'''
STYLES.write_text(styles, encoding="utf-8")

app = APP.read_text(encoding="utf-8")
app = replace_once(
    app,
    "  mapTopTenToggle: $('#mapTopTenToggle'),\n  googleMap: $('#googleMap'),",
    "  mapTopTenToggle: $('#mapTopTenToggle'),\n  mapSearch: $('#mapSearch'),\n  clearMapSearch: $('#clearMapSearch'),\n  googleMap: $('#googleMap'),",
    "referencias del buscador"
)

old = '''function mapStations() {
  let items = filteredStations();
  if (state.filters.mapMode === 'top10' || el.mapTopTenToggle.getAttribute('aria-pressed') === 'true') {
    items = [...items].sort((a, b) => stationPrice(a) - stationPrice(b)).slice(0, 10);
  }
  return items;
}'''
new = '''function mapStations() {
  let items = filteredStations();
  const query = String(el.mapSearch?.value || '').trim().toLocaleLowerCase('es');
  if (query) {
    items = items.filter(station => [
      station.name,
      station.brand,
      station.address,
      station.locality,
      station.municipality
    ].some(value => String(value || '').toLocaleLowerCase('es').includes(query)));
  }
  if (state.filters.mapMode === 'top10' || el.mapTopTenToggle.getAttribute('aria-pressed') === 'true') {
    items = [...items].sort((a, b) => stationPrice(a) - stationPrice(b)).slice(0, 10);
  }
  return items;
}

function renderNativeEmbeddedMap() {
  if (!isNative() || !window.AndroidBridge?.renderNativeMap || !el.googleMap) return false;
  const rect = el.googleMap.getBoundingClientRect();
  const items = mapStations()
    .filter(station => Number.isFinite(station.latitude) && Number.isFinite(station.longitude))
    .map(station => ({
      id: String(station.id),
      name: station.name,
      brand: station.brand || '',
      address: station.address || '',
      latitude: station.latitude,
      longitude: station.longitude,
      price: displayPrice(station),
      status: station.isOpen === true ? 'Abierta' : station.isOpen === false ? 'Cerrada' : 'Estado no disponible',
      schedule: station.schedule || ''
    }));
  el.googleMap.replaceChildren();
  el.googleMap.style.minHeight = '420px';
  window.AndroidBridge.renderNativeMap(
    JSON.stringify({ items }),
    rect.left,
    rect.top,
    rect.width,
    Math.max(rect.height, 420)
  );
  el.mapModeLabel.textContent = `${items.length} gasolineras`;
  return true;
}'''
app = replace_once(app, old, new, "mapStations")
app = replace_once(
    app,
    "async function renderMap() {\n",
    "async function renderMap() {\n  if (renderNativeEmbeddedMap()) {\n    renderMapPreview();\n    return;\n  }\n",
    "renderMap nativo"
)

if "window.CombusplusNativeMap =" not in app:
    app += r'''
window.CombusplusNativeMap = {
  openStation(stationId) {
    const station = state.stations.find(item => String(item.id) === String(stationId));
    if (station) openStationDetail(station);
  }
};

let nativeMapSyncTimer = 0;
const scheduleNativeMapSync = () => {
  if (!isNative()) return;
  clearTimeout(nativeMapSyncTimer);
  nativeMapSyncTimer = window.setTimeout(() => {
    if (document.querySelector('.page.is-active[data-page="map"]')) {
      renderNativeEmbeddedMap();
    }
  }, 80);
};

el.mapSearch?.addEventListener('input', () => {
  renderMapPreview();
  scheduleNativeMapSync();
});
el.clearMapSearch?.addEventListener('click', () => {
  el.mapSearch.value = '';
  renderMapPreview();
  renderMap();
});
el.stationDialog?.addEventListener('close', () => {
  if (document.querySelector('.page.is-active[data-page="map"]')) renderMap();
});
window.addEventListener('resize', scheduleNativeMapSync);
window.addEventListener('scroll', scheduleNativeMapSync, { passive: true });
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav]');
  if (nav?.dataset.nav !== 'map') {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
  }
});
'''
APP.write_text(app, encoding="utf-8")
print("Parche de mapa integrado aplicado.")

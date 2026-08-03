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
index = index.replace(
    '<section class="map-toolbar"><span id="mapModeLabel">Todas las gasolineras</span><button class="switch-btn" id="mapTopTenToggle" type="button" aria-pressed="false">Top 10</button></section>',
    '<section class="map-toolbar"><span id="mapModeLabel">Gasolineras cercanas</span></section>'
)
index = index.replace(
    '<button class="switch-btn" id="mapTopTenToggle" type="button" aria-pressed="false">Top 10</button>',
    ''
)
INDEX.write_text(index, encoding="utf-8")

styles = STYLES.read_text(encoding="utf-8")
extra_css = '''
.page[data-page="map"]{
  padding-bottom:calc(82px + env(safe-area-inset-bottom));
}
.page[data-page="map"] .map-toolbar{
  min-height:54px;
}
.native-shell #googleMap{
  position:relative;
  width:100%;
  height:clamp(360px,52vh,520px);
  min-height:360px;
  max-height:520px;
  overflow:hidden;
  border:1px solid #d8dbe0;
  border-radius:12px;
  background:#eef0f3;
  contain:layout paint;
  touch-action:none;
}
.native-shell #mapPreviewList{
  display:none!important;
}
'''
if "height:clamp(360px,52vh,520px)" not in styles:
    styles += "\n" + extra_css
STYLES.write_text(styles, encoding="utf-8")

app = APP.read_text(encoding="utf-8")

app = app.replace(
    "el.mapTopTenToggle.getAttribute('aria-pressed') === 'true'",
    "false"
)
app = app.replace(
    "el.mapTopTenToggle.setAttribute('aria-pressed', String(state.filters.mapMode === 'top10'));",
    "el.mapTopTenToggle?.setAttribute('aria-pressed', 'false');"
)
app = app.replace(
    "el.mapTopTenToggle.addEventListener('click', () => {",
    "el.mapTopTenToggle?.addEventListener('click', () => {"
)

old_map = '''  const items = mapStations()
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
    }));'''
new_map = '''  const items = mapStations()
    .filter(station => Number.isFinite(station.latitude) && Number.isFinite(station.longitude))
    .sort((a, b) => Number(a.distanceKm || 999) - Number(b.distanceKm || 999))
    .slice(0, 80)
    .map(station => ({
      id: String(station.id),
      name: station.name,
      brand: station.brand || '',
      address: station.address || '',
      latitude: station.latitude,
      longitude: station.longitude,
      price: displayPrice(station),
      status: station.isOpen === true ? 'Abierta' : station.isOpen === false ? 'Cerrada' : 'Estado no disponible',
      schedule: station.schedule || '',
      favorite: isFavorite(station.id)
    }));'''
app = replace_once(app, old_map, new_map, "datos del mapa nativo")

old_render = '''async function renderMap() {
  if (renderNativeEmbeddedMap()) {
    renderMapPreview();
    return;
  }
'''
new_render = '''let nativeNearbyLoading = null;

async function ensureNearbyStationsForMap() {
  if (state.stations.length) return;
  if (nativeNearbyLoading) return nativeNearbyLoading;

  nativeNearbyLoading = (async () => {
    el.mapModeLabel.textContent = 'Buscando gasolineras cercanas…';
    try {
      await requestPosition(true);
      await fetchStations(15);
      state.stations.sort(
        (a, b) => Number(a.distanceKm || 999) - Number(b.distanceKm || 999)
      );
      recordSnapshots(state.stations);
    } finally {
      nativeNearbyLoading = null;
    }
  })();

  return nativeNearbyLoading;
}

async function renderMap() {
  if (isNative()) {
    try {
      await ensureNearbyStationsForMap();
    } catch (error) {
      el.mapModeLabel.textContent =
        error?.message || 'No se pudieron cargar gasolineras cercanas';
    }

    if (renderNativeEmbeddedMap()) {
      return;
    }
  }
'''
app = replace_once(app, old_render, new_render, "carga automática del mapa")

app = app.replace(
    "nativeMapSyncTimer = window.setTimeout(\n    syncNativeMapPosition,\n    20\n  );",
    "nativeMapSyncTimer = window.setTimeout(\n    syncNativeMapPosition,\n    140\n  );"
)

old_input = '''el.mapSearch?.addEventListener('input', () => {
  renderMapPreview();
  scheduleNativeMapSync();
});'''
new_input = '''let mapSearchTimer = 0;
el.mapSearch?.addEventListener('input', () => {
  clearTimeout(mapSearchTimer);
  mapSearchTimer = window.setTimeout(() => {
    scheduleNativeMapSync();
  }, 220);
});'''
app = app.replace(old_input, new_input)

old_toggle_tail = '''  saveFavorites();
  renderBestResult();
  if (state.currentStation?.id === station.id) updateDetailFavoriteButtons();
}'''
new_toggle_tail = '''  saveFavorites();
  renderBestResult();
  if (state.currentStation?.id === station.id) updateDetailFavoriteButtons();
  if (document.querySelector('.page.is-active[data-page="map"]')) {
    scheduleNativeMapSync();
  }
}'''
app = app.replace(old_toggle_tail, new_toggle_tail, 1)

APP.write_text(app, encoding="utf-8")
print("Mapa cercano, sin Top 10 y optimizado.")

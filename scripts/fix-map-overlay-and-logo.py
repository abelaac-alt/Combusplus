#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"
INDEX = ROOT / "web/index.html"


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"No se encontró el bloque esperado: {label}")
    return text.replace(old, new, 1)

# CSS: el mapa queda contenido y con recorte limpio.
styles = STYLES.read_text(encoding="utf-8")
extra_css = '''
.page[data-page="map"] #googleMap{
  position:relative;
  width:100%;
  min-height:360px;
  height:clamp(360px,50vh,500px);
  overflow:hidden;
  border:1px solid #d8dbe0;
  border-radius:14px;
  background:#eef0f3;
  contain:layout paint;
  isolation:isolate;
}
.page[data-page="map"] #googleMap > *{
  max-width:100%;
}
.page[data-page="map"] .map-card,
.page[data-page="map"] .map-frame,
.page[data-page="map"] .map-panel{
  overflow:hidden;
  border-radius:14px;
}
'''
if 'isolation:isolate;' not in styles:
    styles += '\n' + extra_css
STYLES.write_text(styles, encoding='utf-8')

# Top 10 fuera y menos gasolineras para fluidez.
index = INDEX.read_text(encoding='utf-8')
index = index.replace(
    '<button class="switch-btn" id="mapTopTenToggle" type="button" aria-pressed="false">Top 10</button>',
    ''
)
INDEX.write_text(index, encoding='utf-8')

app = APP.read_text(encoding='utf-8')
app = app.replace("el.mapTopTenToggle.getAttribute('aria-pressed') === 'true'", "false")
app = app.replace(
    "el.mapTopTenToggle.setAttribute('aria-pressed', String(state.filters.mapMode === 'top10'));",
    "el.mapTopTenToggle?.setAttribute('aria-pressed', 'false');"
)
app = app.replace(
    "el.mapTopTenToggle.addEventListener('click', () => {",
    "el.mapTopTenToggle?.addEventListener('click', () => {"
)

old_block = '''  const items = mapStations()
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
new_block = '''  const items = mapStations()
    .filter(station => Number.isFinite(station.latitude) && Number.isFinite(station.longitude))
    .sort((a, b) => Number(a.distanceKm || 999) - Number(b.distanceKm || 999))
    .slice(0, 40)
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
app = replace_once(app, old_block, new_block, 'límite de estaciones del mapa')

# Reaparece el mapa al cerrar fichas o volver a la página de mapa.
if 'function reshowNativeMapSoon() {' not in app:
    app += '''

function reshowNativeMapSoon() {
  if (!isNative()) return;
  window.setTimeout(() => {
    const activeMap = document.querySelector('.page.is-active[data-page="map"]');
    if (activeMap) scheduleNativeMapSync();
  }, 160);
}

document.addEventListener('click', event => {
  const target = event.target?.closest?.('button, a, [role="button"]');
  if (!target) return;
  const label = ((target.getAttribute('aria-label') || '') + ' ' + (target.textContent || '')).toLowerCase();
  if (
    target.matches('.close, .sheet-close, .modal-close, [data-close], [data-action="close"]') ||
    label.includes('cerrar') ||
    label.includes('volver')
  ) {
    reshowNativeMapSoon();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reshowNativeMapSoon();
});
window.addEventListener('focus', reshowNativeMapSoon);
'''

APP.write_text(app, encoding='utf-8')
print('Corrección de overlay, logo grande y mapa más fluido aplicada.')

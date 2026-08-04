#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
CSS = ROOT / "web/assets/styles.css"

app = APP.read_text(encoding="utf-8")

# Restaurar la función eliminada accidentalmente por el parche 10.2.
if "async function ensureNearbyStationsForMap()" not in app:
    marker = "async function renderMap()"
    if marker not in app:
        raise RuntimeError("No se encontró async function renderMap()")

    helper = '''let nearbyStationsPromiseV103 = null;

async function ensureNearbyStationsForMap() {
  if (state.stations.length > 0) {
    return state.stations;
  }

  if (nearbyStationsPromiseV103) {
    return nearbyStationsPromiseV103;
  }

  nearbyStationsPromiseV103 = (async () => {
    try {
      if (el.mapModeLabel) {
        el.mapModeLabel.textContent =
          'Buscando gasolineras cercanas…';
      }

      await requestPosition(true);
      await fetchStations(
        Number(state.filters.radius) || 15
      );

      state.stations.sort(
        (a, b) =>
          Number(a.distanceKm || 9999) -
          Number(b.distanceKm || 9999)
      );

      if (typeof recordSnapshots === 'function') {
        recordSnapshots(state.stations);
      }

      return state.stations;
    } finally {
      nearbyStationsPromiseV103 = null;
    }
  })();

  return nearbyStationsPromiseV103;
}

'''
    app = app.replace(marker, helper + marker, 1)

# Anular definitivamente la clase antigua que bloqueaba el scroll.
app += '''

/* Combusplus 10.3: desbloqueo definitivo de la pantalla Mapa */
function normalizeMapScrollV103() {
  const mapPage = document.querySelector(
    '.page.is-active[data-page="map"]'
  );

  if (!mapPage) return;

  document.documentElement.style.overflowY = 'auto';
  document.body.style.overflowY = 'auto';
  document.body.style.height = 'auto';
  document.body.style.minHeight = '100%';

  const shell = document.querySelector('.app-shell');
  const main = document.querySelector('main');

  if (shell) {
    shell.style.height = 'auto';
    shell.style.minHeight = '100dvh';
    shell.style.overflow = 'visible';
  }

  if (main) {
    main.style.height = 'auto';
    main.style.minHeight = '0';
    main.style.overflow = 'visible';
  }

  try {
    window.AndroidBridge?.hideNativeMap?.();
  } catch {
  }
}

document.addEventListener(
  'DOMContentLoaded',
  normalizeMapScrollV103
);
window.addEventListener('load', normalizeMapScrollV103);
window.addEventListener('hashchange', () => {
  window.setTimeout(normalizeMapScrollV103, 30);
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-nav]')) {
    window.setTimeout(normalizeMapScrollV103, 30);
  }
});
'''

APP.write_text(app, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
css += '''

/* Combusplus 10.3: error y scroll del mapa corregidos */
html:has(.page[data-page="map"].is-active),
body:has(.page[data-page="map"].is-active),
body.cp-map-screen{
  height:auto !important;
  min-height:100% !important;
  max-height:none !important;
  overflow-x:hidden !important;
  overflow-y:auto !important;
  overscroll-behavior-y:auto !important;
  touch-action:pan-y !important;
}

body.cp-map-screen .app-shell,
body:has(.page[data-page="map"].is-active) .app-shell{
  position:relative !important;
  height:auto !important;
  min-height:100dvh !important;
  max-height:none !important;
  overflow:visible !important;
}

body.cp-map-screen main,
body:has(.page[data-page="map"].is-active) main{
  position:relative !important;
  height:auto !important;
  min-height:0 !important;
  max-height:none !important;
  overflow:visible !important;
  padding-bottom:
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 34px)
    !important;
}

.page[data-page="map"],
.page[data-page="map"].is-active{
  position:relative !important;
  inset:auto !important;
  height:auto !important;
  min-height:0 !important;
  max-height:none !important;
  overflow:visible !important;
  touch-action:pan-y !important;
}

.page[data-page="map"] #googleMap{
  position:relative !important;
  display:block !important;
  width:calc(100% - 4px) !important;
  height:440px !important;
  min-height:440px !important;
  max-height:440px !important;
  margin:
    0
    2px
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 34px)
    !important;
  overflow:hidden !important;
  border:3px solid #d1131b !important;
  border-radius:18px !important;
  box-sizing:border-box !important;
}

.page[data-page="map"] #googleMap .gm-style,
.page[data-page="map"] #googleMap > div{
  position:absolute !important;
  inset:0 !important;
  width:100% !important;
  height:100% !important;
}

.bottom-nav{
  position:fixed !important;
  bottom:0 !important;
  z-index:2147483647 !important;
}

@media(max-height:760px){
  .page[data-page="map"] #googleMap{
    height:400px !important;
    min-height:400px !important;
    max-height:400px !important;
  }
}
'''

CSS.write_text(css, encoding="utf-8")
print("Combusplus 10.3 aplicado correctamente.")

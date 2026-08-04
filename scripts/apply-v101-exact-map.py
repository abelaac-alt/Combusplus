#!/usr/bin/env python3
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"
WEB_BRIDGE = ROOT / "android/app/src/main/java/com/grupomds/combusplus/WebBridge.java"
MAIN_ACTIVITY = ROOT / "android/app/src/main/java/com/grupomds/combusplus/MainActivity.java"
CONTROLLER = ROOT / "android/app/src/main/java/com/grupomds/combusplus/EmbeddedMapController.java"
CONTROLLER_TEMPLATE = ROOT / "patches/v101/EmbeddedMapController.java"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


require(CONTROLLER_TEMPLATE.is_file(), "Falta la plantilla del mapa 10.1")
CONTROLLER.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(CONTROLLER_TEMPLATE, CONTROLLER)

bridge = WEB_BRIDGE.read_text(encoding="utf-8")
if "renderNativeMapV2(" not in bridge:
    marker = "    @JavascriptInterface\n    public void hideNativeMap() {"
    require(marker in bridge, "No se encontró hideNativeMap en WebBridge")
    method = '''    @JavascriptInterface
    public void renderNativeMapV2(
            String stationsJson,
            double left,
            double top,
            double width,
            double height,
            double viewportWidth,
            double navigationTop
    ) {
        if (stationsJson == null || stationsJson.length() > 2_000_000) return;
        activity.runOnUiThread(() ->
                activity.renderEmbeddedMapV2(
                        stationsJson,
                        left,
                        top,
                        width,
                        height,
                        viewportWidth,
                        navigationTop
                )
        );
    }

'''
    bridge = bridge.replace(marker, method + marker, 1)
WEB_BRIDGE.write_text(bridge, encoding="utf-8")

activity = MAIN_ACTIVITY.read_text(encoding="utf-8")
if "renderEmbeddedMapV2(" not in activity:
    marker = "    public void hideEmbeddedMap() {"
    require(marker in activity, "No se encontró hideEmbeddedMap en MainActivity")
    method = '''    public void renderEmbeddedMapV2(
            String stationsJson,
            double left,
            double top,
            double width,
            double height,
            double viewportWidth,
            double navigationTop
    ) {
        if (embeddedMap != null) {
            embeddedMap.renderV2(
                    stationsJson,
                    left,
                    top,
                    width,
                    height,
                    viewportWidth,
                    navigationTop
            );
        }
    }

'''
    activity = activity.replace(marker, method + marker, 1)
MAIN_ACTIVITY.write_text(activity, encoding="utf-8")

app = APP.read_text(encoding="utf-8")
start = app.find("function renderNativeEmbeddedMap() {")
end = app.find("\nasync function renderMap()", start)
require(start >= 0 and end > start, "No se encontró renderNativeEmbeddedMap")

native_function = r'''function renderNativeEmbeddedMap() {
  if (!isNative() || !el.googleMap) return false;

  const activeMapPage = document.querySelector(
    '.page.is-active[data-page="map"]'
  );
  const dialogOpen = Boolean(document.querySelector('dialog[open]'));

  if (!activeMapPage || dialogOpen) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return true;
  }

  const rect = el.googleMap.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 80) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return true;
  }

  const style = getComputedStyle(el.googleMap);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

  const mapLeft = rect.left + borderLeft;
  const mapTop = rect.top + borderTop;
  const mapWidth = Math.max(1, rect.width - borderLeft - borderRight);
  const mapHeight = Math.max(1, rect.height - borderTop - borderBottom);

  const nav = document.querySelector('.bottom-nav');
  const navRect = nav?.getBoundingClientRect();
  const navigationTop = Number.isFinite(navRect?.top)
    ? navRect.top
    : window.innerHeight;
  const viewportWidth = document.documentElement.clientWidth
    || window.innerWidth
    || rect.width;

  const items = mapStations()
    .filter(station => (
      Number.isFinite(station.latitude)
      && Number.isFinite(station.longitude)
    ))
    .map(station => ({
      id: String(station.id),
      name: station.name,
      brand: station.brand || '',
      address: station.address || '',
      latitude: station.latitude,
      longitude: station.longitude,
      price: displayPrice(station),
      status: station.isOpen === true
        ? 'Abierta'
        : station.isOpen === false
          ? 'Cerrada'
          : 'Estado no disponible',
      schedule: station.schedule || '',
      favorite: isFavorite(station.id)
    }));

  el.googleMap.replaceChildren();

  try {
    if (window.AndroidBridge?.renderNativeMapV2) {
      window.AndroidBridge.renderNativeMapV2(
        JSON.stringify({ items }),
        mapLeft,
        mapTop,
        mapWidth,
        mapHeight,
        viewportWidth,
        navigationTop
      );
    } else if (window.AndroidBridge?.renderNativeMap) {
      window.AndroidBridge.renderNativeMap(
        JSON.stringify({ items }),
        mapLeft,
        mapTop,
        mapWidth,
        mapHeight
      );
    } else {
      return false;
    }
  } catch {
    return false;
  }

  el.mapModeLabel.textContent = `${items.length} gasolineras`;
  return true;
}'''

app = app[:start] + native_function + app[end:]

if "function scheduleExactNativeMapV101()" not in app:
    app += r'''

/* Combusplus 10.1: sincronización exacta del mapa nativo */
let nativeMapFrameV101 = 0;
function scheduleExactNativeMapV101() {
  cancelAnimationFrame(nativeMapFrameV101);
  nativeMapFrameV101 = requestAnimationFrame(() => {
    const active = document.querySelector(
      '.page.is-active[data-page="map"]'
    );
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));

    if (!active || dialogOpen) {
      try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
      return;
    }

    renderNativeEmbeddedMap();
  });
}

window.addEventListener(
  'scroll',
  scheduleExactNativeMapV101,
  { passive:true, capture:true }
);
document.addEventListener(
  'scroll',
  scheduleExactNativeMapV101,
  { passive:true, capture:true }
);
window.addEventListener('resize', scheduleExactNativeMapV101);
window.visualViewport?.addEventListener(
  'resize',
  scheduleExactNativeMapV101
);
window.visualViewport?.addEventListener(
  'scroll',
  scheduleExactNativeMapV101
);
window.addEventListener('hashchange', scheduleExactNativeMapV101);

document.addEventListener('click', event => {
  if (
    event.target.closest('[data-nav]')
    || event.target.closest('[data-close-dialog]')
  ) {
    window.setTimeout(scheduleExactNativeMapV101, 40);
  }
});

new MutationObserver(scheduleExactNativeMapV101).observe(
  document.body,
  {
    subtree:true,
    attributes:true,
    attributeFilter:['class', 'open', 'hidden', 'aria-hidden']
  }
);
'''

APP.write_text(app, encoding="utf-8")

styles = STYLES.read_text(encoding="utf-8")
css = r'''
/* Combusplus 10.1: mapa alineado con el marco y separado del menú */
:root{
  --cp-v101-nav:76px;
}

body.cp-map-screen{
  overflow-y:auto !important;
  overscroll-behavior-y:contain !important;
}

body.cp-map-screen main{
  padding-bottom:calc(
    var(--cp-v101-nav) + var(--safe-bottom) + 22px
  ) !important;
  overflow:visible !important;
}

.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  height:calc(var(--cp-v101-nav) + var(--safe-bottom)) !important;
  min-height:var(--cp-v101-nav) !important;
  padding-bottom:var(--safe-bottom) !important;
  z-index:2147483000 !important;
  display:grid !important;
  visibility:visible !important;
  opacity:1 !important;
  background:#fff !important;
  border-top:1px solid #d8dce2 !important;
  box-shadow:0 -7px 24px rgba(12,18,28,.15) !important;
}

.page[data-page="map"]{
  position:relative !important;
  inset:auto !important;
  display:none !important;
  width:100% !important;
  height:auto !important;
  min-height:auto !important;
  overflow:visible !important;
  padding:0 !important;
  margin:0 !important;
  background:#f4f5f7 !important;
}

.page[data-page="map"].is-active{
  display:block !important;
}

.page[data-page="map"] #googleMap{
  position:relative !important;
  display:block !important;
  width:100% !important;
  max-width:900px !important;
  height:clamp(390px,56dvh,540px) !important;
  min-height:390px !important;
  max-height:540px !important;
  margin:0 auto calc(
    var(--cp-v101-nav) + var(--safe-bottom) + 22px
  ) !important;
  padding:0 !important;
  overflow:hidden !important;
  border:3px solid #d1131b !important;
  border-radius:16px !important;
  box-sizing:border-box !important;
  background:#eef0f3 !important;
  contain:layout paint !important;
  isolation:isolate !important;
  box-shadow:0 8px 22px rgba(20,24,32,.11) !important;
}

.page[data-page="map"] #mapPreviewList{
  display:none !important;
}

@media(max-height:740px){
  .page[data-page="map"] #googleMap{
    height:390px !important;
    min-height:390px !important;
  }
}
'''
if "Combusplus 10.1: mapa alineado" not in styles:
    styles += "\n" + css
STYLES.write_text(styles, encoding="utf-8")

print("Combusplus 10.1 aplicado correctamente.")

#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
CSS = ROOT / "web/assets/styles.css"
GRADLE = ROOT / "android/app/build.gradle.kts"

def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"No se encontró: {label}")
    return text.replace(old, new, 1)

app = APP.read_text(encoding="utf-8")
start = app.find("function renderNativeEmbeddedMap()")
end = app.find("\nasync function renderMap()", start)

if start < 0 or end < 0:
    raise RuntimeError("No se encontró la integración nativa actual del mapa.")

replacement = '''function renderNativeEmbeddedMap() {
  try {
    window.AndroidBridge?.hideNativeMap?.();
  } catch {
  }
  return false;
}
'''

app = app[:start] + replacement + app[end:]

app += '''
try {
  window.AndroidBridge?.hideNativeMap?.();
} catch {
}

window.addEventListener('scroll', () => {
  try {
    window.AndroidBridge?.hideNativeMap?.();
  } catch {
  }
}, { passive:true });

document.addEventListener('click', event => {
  if (event.target.closest('[data-nav]')) {
    try {
      window.AndroidBridge?.hideNativeMap?.();
    } catch {
    }
  }
});
'''

APP.write_text(app, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
css += '''
/* Combusplus 10.2: mapa integrado dentro de la interfaz */
:root{
  --cp-v102-nav-height:72px;
  --cp-v102-side:14px;
}

html,
body{
  overflow-x:hidden !important;
}

body{
  overflow-y:auto !important;
}

.app-shell{
  padding-bottom:
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 18px)
    !important;
}

main{
  padding:
    14px
    max(var(--cp-v102-side),var(--safe-right))
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 24px)
    max(var(--cp-v102-side),var(--safe-left))
    !important;
  overflow:visible !important;
}

.page[data-page="map"]{
  position:relative !important;
  inset:auto !important;
  display:none !important;
  width:100% !important;
  height:auto !important;
  min-height:0 !important;
  max-height:none !important;
  padding:0 !important;
  margin:0 !important;
  overflow:visible !important;
  background:transparent !important;
}

.page[data-page="map"].is-active{
  display:block !important;
}

.page[data-page="map"] .page-head{
  margin:0 0 14px !important;
}

.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card,
.page[data-page="map"] .map-toolbar{
  width:100% !important;
  margin:0 0 12px !important;
  border-radius:12px !important;
}

.page[data-page="map"] #googleMap{
  position:relative !important;
  inset:auto !important;
  display:block !important;
  width:100% !important;
  height:clamp(390px,54dvh,540px) !important;
  min-height:390px !important;
  max-height:540px !important;
  margin:
    0
    auto
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 22px)
    !important;
  padding:0 !important;
  overflow:hidden !important;
  border:3px solid #d1131b !important;
  border-radius:18px !important;
  box-sizing:border-box !important;
  background:#eef0f3 !important;
  box-shadow:0 8px 22px rgba(17,22,31,.12) !important;
  contain:layout paint !important;
  isolation:isolate !important;
}

.page[data-page="map"] #googleMap > div,
.page[data-page="map"] #googleMap .gm-style{
  width:100% !important;
  height:100% !important;
  border-radius:14px !important;
}

.page[data-page="map"] #mapPreviewList{
  display:none !important;
}

.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  height:
    calc(var(--cp-v102-nav-height) + var(--safe-bottom))
    !important;
  min-height:var(--cp-v102-nav-height) !important;
  padding-bottom:var(--safe-bottom) !important;
  display:grid !important;
  visibility:visible !important;
  opacity:1 !important;
  z-index:2147483640 !important;
  background:#fff !important;
  border-top:1px solid #d8dce2 !important;
  box-shadow:0 -7px 22px rgba(12,18,28,.15) !important;
}

@media(max-height:760px){
  .page[data-page="map"] #googleMap{
    height:400px !important;
    min-height:400px !important;
  }
}

@media(max-width:520px){
  :root{
    --cp-v102-side:12px;
    --cp-v102-nav-height:66px;
  }

  .page[data-page="map"] #googleMap{
    height:430px !important;
    min-height:430px !important;
    border-radius:16px !important;
  }
}
'''

CSS.write_text(css, encoding="utf-8")

gradle = GRADLE.read_text(encoding="utf-8")

gradle = replace_once(
    gradle,
    'val androidMapsApiKey = providers.gradleProperty("GOOGLE_MAPS_ANDROID_API_KEY").orElse("")\n',
    'val androidMapsApiKey = providers.gradleProperty("GOOGLE_MAPS_ANDROID_API_KEY").orElse("")\n'
    'val webMapsApiKey = providers.gradleProperty("GOOGLE_MAPS_WEB_API_KEY").orElse("")\n',
    "propiedad GOOGLE_MAPS_WEB_API_KEY"
)

gradle = replace_once(
    gradle,
    "              googleMapsKey: '',\n",
    "              googleMapsKey: '${jsString(webMapsApiKey.get())}',\n",
    "clave Maps JavaScript en config.js"
)

GRADLE.write_text(gradle, encoding="utf-8")
print("Combusplus 10.2 aplicado correctamente.")

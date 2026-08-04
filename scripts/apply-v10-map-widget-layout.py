#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

CONTROLLER_TEMPLATE = ROOT / "patches/v10/EmbeddedMapController.java"
WIDGET_TEMPLATE = ROOT / "patches/v10/widget_favorite_prices.xml"
CONTROLLER_TARGET = (
    ROOT
    / "android/app/src/main/java/com/grupomds/combusplus/"
    / "EmbeddedMapController.java"
)
WIDGET_TARGET = (
    ROOT
    / "android/app/src/main/res/layout/"
    / "widget_favorite_prices.xml"
)
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"

for source, target in (
    (CONTROLLER_TEMPLATE, CONTROLLER_TARGET),
    (WIDGET_TEMPLATE, WIDGET_TARGET),
):
    if not source.is_file():
        raise RuntimeError(f"Falta la plantilla {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

styles = STYLES.read_text(encoding="utf-8")

css = r'''
/* Combusplus 10.0: mapa desplazable sin solapamientos */
:root{
  --cp-v10-nav-height:76px;
}

html,
body{
  overflow-x:hidden !important;
}

body.cp-map-screen{
  overflow-y:auto !important;
  overscroll-behavior-y:contain !important;
}

body.cp-map-screen main{
  padding:
    14px
    max(12px,var(--safe-right))
    calc(var(--cp-v10-nav-height) + 24px)
    max(12px,var(--safe-left)) !important;
  margin:0 !important;
  overflow:visible !important;
}

.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  min-height:var(--cp-v10-nav-height) !important;
  height:calc(
    var(--cp-v10-nav-height) + var(--safe-bottom)
  ) !important;
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
  top:auto !important;
  right:auto !important;
  bottom:auto !important;
  left:auto !important;
  display:none !important;
  width:100% !important;
  max-width:100% !important;
  min-height:auto !important;
  height:auto !important;
  grid-template-rows:none !important;
  gap:0 !important;
  overflow:visible !important;
  padding:0 !important;
  margin:0 !important;
  background:#f4f5f7 !important;
}

.page[data-page="map"].is-active{
  display:block !important;
}

.page[data-page="map"] .page-head{
  margin:0 0 12px !important;
}

.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card,
.page[data-page="map"] .map-toolbar{
  margin:0 0 10px !important;
  border-radius:10px !important;
}

.page[data-page="map"] #googleMap{
  position:relative !important;
  display:block !important;
  width:100% !important;
  max-width:900px !important;
  height:clamp(390px,55dvh,560px) !important;
  min-height:390px !important;
  max-height:560px !important;
  margin:
    0
    auto
    calc(var(--cp-v10-nav-height) + 22px) !important;
  padding:0 !important;
  overflow:hidden !important;
  border:0 !important;
  border-radius:16px !important;
  box-sizing:border-box !important;
  background:#d1131b !important;
  contain:layout paint !important;
  isolation:isolate !important;
  box-shadow:0 9px 24px rgba(20,24,32,.12) !important;
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

if "Combusplus 10.0: mapa desplazable" not in styles:
    styles += "\n" + css

STYLES.write_text(styles, encoding="utf-8")

app = APP.read_text(encoding="utf-8")

js = r'''
/* Combusplus 10.0 */
let nativeMapFrameV10 = 0;

function syncNativeMapFrameV10() {
  cancelAnimationFrame(nativeMapFrameV10);

  nativeMapFrameV10 = requestAnimationFrame(() => {
    const mapPage = document.querySelector(
      '.page.is-active[data-page="map"]'
    );

    document.body.classList.toggle(
      'cp-map-screen',
      Boolean(mapPage)
    );

    const nav = document.querySelector('.bottom-nav');
    if (nav) {
      nav.hidden = false;
      nav.removeAttribute('aria-hidden');
      nav.style.display = 'grid';
      nav.style.visibility = 'visible';
    }

    const dialogOpen = Boolean(
      document.querySelector('dialog[open]')
    );

    if (!mapPage || dialogOpen) {
      try {
        window.AndroidBridge?.hideNativeMap?.();
      } catch {
      }
      return;
    }

    try {
      scheduleNativeMapSync();
    } catch {
    }
  });
}

window.addEventListener(
  'scroll',
  syncNativeMapFrameV10,
  { passive:true, capture:true }
);

document.addEventListener(
  'scroll',
  syncNativeMapFrameV10,
  { passive:true, capture:true }
);

window.addEventListener(
  'resize',
  syncNativeMapFrameV10
);

window.visualViewport?.addEventListener(
  'resize',
  syncNativeMapFrameV10
);

window.visualViewport?.addEventListener(
  'scroll',
  syncNativeMapFrameV10
);

window.addEventListener(
  'hashchange',
  syncNativeMapFrameV10
);

document.addEventListener('click', event => {
  if (
    event.target.closest('[data-nav]') ||
    event.target.closest('[data-close-dialog]')
  ) {
    window.setTimeout(syncNativeMapFrameV10, 40);
  }
});

document.addEventListener(
  'DOMContentLoaded',
  syncNativeMapFrameV10
);

window.addEventListener(
  'load',
  syncNativeMapFrameV10
);

new MutationObserver(syncNativeMapFrameV10).observe(
  document.body,
  {
    subtree:true,
    attributes:true,
    attributeFilter:[
      'class',
      'open',
      'hidden',
      'aria-hidden'
    ]
  }
);
'''

if "function syncNativeMapFrameV10()" not in app:
    app += "\n" + js

APP.write_text(app, encoding="utf-8")
print("Combusplus 10.0 aplicado correctamente.")

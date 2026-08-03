#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"

app = APP.read_text(encoding="utf-8")

old = """let nativeMapSyncTimer = 0;
const scheduleNativeMapSync = () => {
  if (!isNative()) return;
  clearTimeout(nativeMapSyncTimer);
  nativeMapSyncTimer = window.setTimeout(() => {
    if (document.querySelector('.page.is-active[data-page="map"]')) {
      renderNativeEmbeddedMap();
    }
  }, 80);
};"""

new = """let nativeMapSyncTimer = 0;
let nativeMapAnimationFrame = 0;

const syncNativeMapPosition = () => {
  if (!isNative()) return;

  cancelAnimationFrame(nativeMapAnimationFrame);
  nativeMapAnimationFrame = requestAnimationFrame(() => {
    const activeMap = document.querySelector(
      '.page.is-active[data-page="map"]'
    );

    if (!activeMap) {
      try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
      return;
    }

    renderNativeEmbeddedMap();
  });
};

const scheduleNativeMapSync = () => {
  if (!isNative()) return;

  clearTimeout(nativeMapSyncTimer);
  nativeMapSyncTimer = window.setTimeout(
    syncNativeMapPosition,
    20
  );
};"""

if new not in app:
    if old not in app:
        raise SystemExit(
            "No se encontró el sincronizador del mapa nativo."
        )
    app = app.replace(old, new, 1)

old_listeners = """window.addEventListener('resize', scheduleNativeMapSync);
window.addEventListener('scroll', scheduleNativeMapSync, { passive: true });"""

new_listeners = """window.addEventListener(
  'resize',
  syncNativeMapPosition
);
window.addEventListener(
  'scroll',
  syncNativeMapPosition,
  { passive: true, capture: true }
);
document.addEventListener(
  'scroll',
  syncNativeMapPosition,
  { passive: true, capture: true }
);
window.visualViewport?.addEventListener(
  'resize',
  syncNativeMapPosition
);
window.visualViewport?.addEventListener(
  'scroll',
  syncNativeMapPosition
);"""

if new_listeners not in app:
    if old_listeners not in app:
        raise SystemExit(
            "No se encontraron los listeners del mapa."
        )
    app = app.replace(old_listeners, new_listeners, 1)

APP.write_text(app, encoding="utf-8")

styles = STYLES.read_text(encoding="utf-8")
fixed_css = """
.native-shell #googleMap{
  position:relative;
  min-height:420px;
  overflow:hidden;
  border:1px solid #d8dbe0;
  border-radius:10px;
  background:#eef0f3;
  contain:layout paint;
}
"""
if "contain:layout paint" not in styles:
    styles += "\n" + fixed_css

STYLES.write_text(styles, encoding="utf-8")
print("Sincronización del recuadro fijo aplicada.")

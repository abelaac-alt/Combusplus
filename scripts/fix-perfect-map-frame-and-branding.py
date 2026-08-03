#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'web/src/app.js'
INDEX = ROOT / 'web/index.html'
STYLES = ROOT / 'web/assets/styles.css'
MANIFEST = ROOT / 'android/app/src/main/AndroidManifest.xml'

styles = STYLES.read_text(encoding='utf-8')
css = '''
/* Combusplus 9.6.8: el recuadro DOM define exactamente el tamaño nativo */
.page[data-page="map"] #googleMap{
  position:relative !important;
  width:100% !important;
  aspect-ratio:1 / 1 !important;
  height:auto !important;
  min-height:0 !important;
  max-height:none !important;
  padding:0 !important;
  margin:0 !important;
  border:0 !important;
  border-radius:18px !important;
  overflow:hidden !important;
  background:transparent !important;
  box-sizing:border-box !important;
  contain:layout paint !important;
  isolation:isolate !important;
}
.page[data-page="map"] .map-card,
.page[data-page="map"] .map-frame,
.page[data-page="map"] .map-panel{
  border:0 !important;
  padding:0 !important;
  overflow:visible !important;
  background:transparent !important;
}
.app-brand img,
.brand img,
.topbar img,
header img[alt="Combusplus"],
img[data-brand="combusplus"]{
  width:52px !important;
  height:52px !important;
  object-fit:contain !important;
  background:transparent !important;
  border-radius:0 !important;
}
'''
if 'Combusplus 9.6.8: el recuadro DOM define exactamente' not in styles:
    styles += '\n' + css
STYLES.write_text(styles, encoding='utf-8')

app = APP.read_text(encoding='utf-8')

# El mapa nunca se renderiza mientras haya una ficha/modal abierta.
needle = 'function renderNativeEmbeddedMap() {'
if needle in app and 'mapOverlayOpen' not in app:
    app = app.replace(
        needle,
        needle + '''\n  const mapOverlayOpen = Boolean(document.querySelector(\n    'dialog[open], .modal.is-open, .sheet.is-open, .station-dialog[open], [data-station-detail].is-open'\n  ));\n  if (mapOverlayOpen) {\n    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}\n    return true;\n  }''',
        1
    )

# Observa apertura/cierre de fichas para ocultar y restaurar el mapa correctamente.
if 'function syncMapAgainstOverlays() {' not in app:
    app += '''

function syncMapAgainstOverlays() {
  if (!isNative()) return;
  const open = Boolean(document.querySelector(
    'dialog[open], .modal.is-open, .sheet.is-open, .station-dialog[open], [data-station-detail].is-open'
  ));
  if (open) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return;
  }
  if (document.querySelector('.page.is-active[data-page="map"]')) {
    window.setTimeout(() => scheduleNativeMapSync(), 120);
  }
}

new MutationObserver(syncMapAgainstOverlays).observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['open', 'class', 'hidden', 'aria-hidden']
});
'''

# Cabecera con PNG transparente.
if 'function applyTransparentHeaderLogoV968() {' not in app:
    app += '''

function applyTransparentHeaderLogoV968() {
  document.querySelectorAll(
    '.app-brand img, .brand img, .topbar img, header img[alt="Combusplus"], img[data-brand="combusplus"]'
  ).forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    img.src = 'assets/combusplus-header-logo.png';
    img.alt = 'Combusplus';
  });
}

document.addEventListener('DOMContentLoaded', applyTransparentHeaderLogoV968);
window.addEventListener('load', applyTransparentHeaderLogoV968);
'''

APP.write_text(app, encoding='utf-8')

# Icono instalado con fondo blanco mediante drawable PNG.
manifest = MANIFEST.read_text(encoding='utf-8')
manifest = re.sub(r'android:icon="@[^"]+"', 'android:icon="@drawable/combusplus_app_icon"', manifest)
if 'android:roundIcon=' in manifest:
    manifest = re.sub(r'android:roundIcon="@[^"]+"', 'android:roundIcon="@drawable/combusplus_app_icon"', manifest)
MANIFEST.write_text(manifest, encoding='utf-8')

print('Marco exacto del mapa y branding 9.6.8 aplicados.')

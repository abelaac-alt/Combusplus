#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"
INDEX = ROOT / "web/index.html"

styles = STYLES.read_text(encoding="utf-8")
block = '''
/* Combusplus 9.6.3: mapa cuadrado con borde rojo */
.page[data-page="map"] #googleMap{
  position:relative !important;
  width:100% !important;
  aspect-ratio:1 / 1 !important;
  min-height:320px !important;
  height:auto !important;
  max-height:none !important;
  overflow:hidden !important;
  border:3px solid #d1131b !important;
  border-radius:18px !important;
  background:#f4f5f7 !important;
  contain:layout paint !important;
  isolation:isolate !important;
  box-sizing:border-box !important;
}
.page[data-page="map"] #googleMap > *{max-width:100%;}
.page[data-page="map"] .map-card,
.page[data-page="map"] .map-frame,
.page[data-page="map"] .map-panel{
  overflow:hidden !important;
  border-radius:18px !important;
}
'''
if 'Combusplus 9.6.3: mapa cuadrado con borde rojo' not in styles:
    styles += '\n' + block
STYLES.write_text(styles, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
index = re.sub(
    r'<button[^>]*id=["\']mapTopTenToggle["\'][^>]*>.*?</button>',
    '',
    index,
    flags=re.S,
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

# Elimina únicamente límites consecutivos al listado del mapa nativo.
start = app.find('function renderNativeEmbeddedMap()')
if start != -1:
    end = app.find('\n}', start)
    if end != -1:
        section = app[start:end + 2]
        section = re.sub(r'\n\s*\.slice\(0,\s*(?:40|80|100)\)', '', section)
        app = app[:start] + section + app[end + 2:]

if 'function applyCombusplusBrandingLogo() {' not in app:
    app += '''

function applyCombusplusBrandingLogo() {
  const selectors = [
    '.app-brand img', '.brand img', '.topbar img', 'header img',
    'img[alt="Combusplus"]', 'img[data-brand="combusplus"]'
  ];
  document.querySelectorAll(selectors.join(',')).forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    img.src = 'assets/combusplus-app-logo.png';
    img.alt = 'Combusplus';
  });
}
document.addEventListener('DOMContentLoaded', applyCombusplusBrandingLogo);
window.addEventListener('load', applyCombusplusBrandingLogo);
'''

APP.write_text(app, encoding='utf-8')
print('Mapa cuadrado, branding y carga sin límite aplicados.')

#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
INDEX = ROOT / "web/index.html"
STYLES = ROOT / "web/assets/styles.css"


def ensure(condition, message):
    if not condition:
        raise RuntimeError(message)


def insert_after(text, needle, addition, label):
    if addition.strip() in text:
        return text
    ensure(needle in text, f"No se encontró {label}")
    return text.replace(needle, needle + addition, 1)

index = INDEX.read_text(encoding="utf-8")

# Filtro de abiertas, insertado tras el buscador del mapa.
filter_html = '''
        <section class="map-filter-card" aria-label="Filtros del mapa">
          <label class="map-open-filter" for="mapOpenOnly">
            <input id="mapOpenOnly" type="checkbox">
            <span>Mostrar solo gasolineras abiertas</span>
          </label>
        </section>'''

if 'id="mapOpenOnly"' not in index:
    candidates = [
        '</section>\n        <section class="map-toolbar">',
        '</section>\r\n        <section class="map-toolbar">',
    ]
    inserted = False
    for candidate in candidates:
        if candidate in index:
            index = index.replace(candidate, '</section>' + filter_html + '\n        <section class="map-toolbar">', 1)
            inserted = True
            break
    ensure(inserted, 'el punto de inserción del filtro del mapa')

# Top 10 desaparece definitivamente.
index = re.sub(
    r'<button[^>]*id=["\']mapTopTenToggle["\'][^>]*>.*?</button>',
    '',
    index,
    flags=re.S,
)
INDEX.write_text(index, encoding='utf-8')

styles = STYLES.read_text(encoding='utf-8')
css = '''
/* Combusplus 9.6.4: un único marco rojo y filtro de abiertas */
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
  background:#eef0f3 !important;
  box-sizing:border-box !important;
  contain:layout paint !important;
  isolation:isolate !important;
}
.page[data-page="map"] .map-card,
.page[data-page="map"] .map-frame,
.page[data-page="map"] .map-panel{
  border:0 !important;
  outline:0 !important;
  box-shadow:none !important;
  overflow:visible !important;
  background:transparent !important;
}
.map-filter-card{
  margin:0 0 12px;
  padding:14px 16px;
  border:1px solid #d8dbe0;
  background:#fff;
}
.map-open-filter{
  display:flex;
  align-items:center;
  gap:11px;
  font-weight:750;
  cursor:pointer;
}
.map-open-filter input{
  width:22px;
  height:22px;
  accent-color:#d1131b;
}
'''
if 'Combusplus 9.6.4: un único marco rojo' not in styles:
    styles += '\n' + css
STYLES.write_text(styles, encoding='utf-8')

app = APP.read_text(encoding='utf-8')

# Referencia al filtro.
if "mapOpenOnly: $('#mapOpenOnly')" not in app:
    anchors = [
        "  clearMapSearch: $('#clearMapSearch'),\n",
        "  mapSearch: $('#mapSearch'),\n",
    ]
    for anchor in anchors:
        if anchor in app:
            app = app.replace(anchor, anchor + "  mapOpenOnly: $('#mapOpenOnly'),\n", 1)
            break
    else:
        raise RuntimeError('No se encontró el bloque de referencias del mapa')

# Elimina límite de estaciones exclusivamente del render del mapa nativo.
start = app.find('function renderNativeEmbeddedMap()')
ensure(start >= 0, 'renderNativeEmbeddedMap()')
end = app.find('\n}', start)
ensure(end > start, 'fin de renderNativeEmbeddedMap()')
section = app[start:end + 2]
section = re.sub(r'\n\s*\.slice\(0,\s*\d+\)', '', section)

# Evita mostrar el mapa mientras la ficha está abierta.
if "const stationSheetOpen" not in section:
    section = section.replace(
        "  if (!isNative() || !window.AndroidBridge?.renderNativeMap || !el.googleMap) return false;",
        "  if (!isNative() || !window.AndroidBridge?.renderNativeMap || !el.googleMap) return false;\n"
        "  const stationSheetOpen = Boolean(el.stationDialog?.open || document.querySelector('dialog[open]'));\n"
        "  if (stationSheetOpen) {\n"
        "    try { window.AndroidBridge.hideNativeMap(); } catch {}\n"
        "    return true;\n"
        "  }",
        1,
    )
app = app[:start] + section + app[end + 2:]

# Filtro de abiertas dentro de mapStations().
map_start = app.find('function mapStations()')
ensure(map_start >= 0, 'mapStations()')
map_end = app.find('\n}', map_start)
ensure(map_end > map_start, 'fin de mapStations()')
map_section = app[map_start:map_end + 2]
open_filter = "\n  if (el.mapOpenOnly?.checked) {\n    items = items.filter(station => station.isOpen === true);\n  }"
if open_filter.strip() not in map_section:
    needle = '  let items = filteredStations();'
    ensure(needle in map_section, 'lista inicial de mapStations')
    map_section = map_section.replace(needle, needle + open_filter, 1)
app = app[:map_start] + map_section + app[map_end + 2:]

# No reabre el mapa al tocar favorito dentro de la ficha.
app = re.sub(
    r"\n\s*if \(document\.querySelector\('\.page\.is-active\[data-page=\"map\"\]'\)\) \{\s*scheduleNativeMapSync\(\);\s*\}",
    '',
    app,
)

# Sincronización segura del filtro.
listener = '''
el.mapOpenOnly?.addEventListener('change', () => {
  if (el.stationDialog?.open) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return;
  }
  renderMap();
});
'''
if "el.mapOpenOnly?.addEventListener('change'" not in app:
    app += '\n' + listener

# Observer: mientras haya ficha/dialog abierto el mapa queda oculto.
observer = '''
const nativeMapModalObserver = new MutationObserver(() => {
  const dialogOpen = Boolean(el.stationDialog?.open || document.querySelector('dialog[open]'));
  if (dialogOpen) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return;
  }
  if (document.querySelector('.page.is-active[data-page="map"]')) {
    window.setTimeout(() => scheduleNativeMapSync(), 120);
  }
});
nativeMapModalObserver.observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ['open', 'class', 'aria-hidden']
});
'''
if 'const nativeMapModalObserver' not in app:
    app += '\n' + observer

APP.write_text(app, encoding='utf-8')
print('Mapa, marcadores de precio y filtro de abiertas aplicados.')

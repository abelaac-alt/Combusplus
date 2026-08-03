#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
INDEX = ROOT / "web/index.html"
STYLES = ROOT / "web/assets/styles.css"


def require_file(path: Path) -> str:
    if not path.is_file():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return path.read_text(encoding="utf-8")


def function_block(text: str, signature: str) -> tuple[int, int, str]:
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f"No se encontró {signature}")

    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"No se encontró la apertura de {signature}")

    depth = 0
    quote = None
    escaped = False
    i = brace

    while i < len(text):
        ch = text[i]

        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
        else:
            if ch in ("'", '"', '`'):
                quote = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return start, i + 1, text[start:i + 1]

        i += 1

    raise RuntimeError(f"No se encontró el cierre de {signature}")


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
index = require_file(INDEX)

filter_html = '''
        <section class="map-filter-card" aria-label="Filtros del mapa">
          <label class="map-open-filter" for="mapOpenOnly">
            <input id="mapOpenOnly" type="checkbox">
            <span>Mostrar solo gasolineras abiertas</span>
          </label>
        </section>'''

if 'id="mapOpenOnly"' not in index:
    inserted = False

    # 1. Antes de la barra/contador del mapa.
    toolbar_patterns = [
        r'(?=<section[^>]*class=["\'][^"\']*map-toolbar[^"\']*["\'][^>]*>)',
        r'(?=<div[^>]*class=["\'][^"\']*map-toolbar[^"\']*["\'][^>]*>)',
    ]
    for pattern in toolbar_patterns:
        match = re.search(pattern, index, flags=re.I)
        if match:
            index = index[:match.start()] + filter_html + "\n" + index[match.start():]
            inserted = True
            break

    # 2. Justo antes del contenedor del mapa.
    if not inserted:
        map_match = re.search(
            r'(?=<[^>]+id=["\']googleMap["\'][^>]*>)',
            index,
            flags=re.I,
        )
        if map_match:
            index = index[:map_match.start()] + filter_html + "\n" + index[map_match.start():]
            inserted = True

    # 3. Dentro de la página de mapa, antes de su cierre.
    if not inserted:
        page_match = re.search(
            r'(<(?:section|main|div)[^>]*(?:data-page=["\']map["\']|id=["\']page-map["\'])[^>]*>)(.*?)(</(?:section|main|div)>)',
            index,
            flags=re.I | re.S,
        )
        if page_match:
            replacement = (
                page_match.group(1)
                + page_match.group(2)
                + filter_html
                + "\n"
                + page_match.group(3)
            )
            index = index[:page_match.start()] + replacement + index[page_match.end():]
            inserted = True

    if not inserted:
        raise RuntimeError(
            "No se pudo localizar automáticamente la sección Mapa. "
            "Comprueba que web/index.html contiene #googleMap, .map-toolbar o data-page=\"map\"."
        )

# Elimina Top 10 sin depender del formato exacto.
index = re.sub(
    r'<button[^>]*id=["\']mapTopTenToggle["\'][^>]*>.*?</button>',
    '',
    index,
    flags=re.I | re.S,
)
INDEX.write_text(index, encoding="utf-8")


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
styles = require_file(STYLES)
css = '''
/* Combusplus 9.6.5: marco único y filtro de abiertas */
.page[data-page="map"] #googleMap,
#page-map #googleMap{
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
.page[data-page="map"] .map-panel,
#page-map .map-card,
#page-map .map-frame,
#page-map .map-panel{
  border:0 !important;
  outline:0 !important;
  box-shadow:none !important;
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
if 'Combusplus 9.6.5: marco único y filtro de abiertas' not in styles:
    styles += "\n" + css
STYLES.write_text(styles, encoding="utf-8")


# ---------------------------------------------------------------------------
# JavaScript
# ---------------------------------------------------------------------------
app = require_file(APP)

# Referencia al checkbox dentro del objeto el.
if "mapOpenOnly: $('#mapOpenOnly')" not in app:
    reference_patterns = [
        r"(^\s*clearMapSearch:\s*\$\('#clearMapSearch'\),\s*$)",
        r"(^\s*mapSearch:\s*\$\('#mapSearch'\),\s*$)",
        r"(^\s*googleMap:\s*\$\('#googleMap'\),\s*$)",
    ]
    inserted = False
    for pattern in reference_patterns:
        match = re.search(pattern, app, flags=re.M)
        if match:
            indent = re.match(r"\s*", match.group(1)).group(0)
            addition = f"\n{indent}mapOpenOnly: $('#mapOpenOnly'),"
            app = app[:match.end()] + addition + app[match.end():]
            inserted = True
            break
    if not inserted:
        raise RuntimeError("No se encontró el objeto de referencias DOM del mapa en web/src/app.js")

# renderNativeEmbeddedMap: quitar límites y ocultar mapa durante una ficha/modal.
start, end, section = function_block(app, 'function renderNativeEmbeddedMap()')
section = re.sub(r'\n\s*\.slice\(0,\s*\d+\)', '', section)

if 'const stationSheetOpen' not in section:
    guard_patterns = [
        r"(\s*if\s*\(!isNative\(\).*?return false;)",
        r"(\s*if\s*\([^\n]*AndroidBridge[^\n]*\)\s*return false;)",
    ]
    added = False
    guard_code = (
        "\n  const stationSheetOpen = Boolean(\n"
        "    el.stationDialog?.open ||\n"
        "    document.querySelector('dialog[open], .modal.is-open, .sheet.is-open, [aria-modal=\"true\"]')\n"
        "  );\n"
        "  if (stationSheetOpen) {\n"
        "    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}\n"
        "    return true;\n"
        "  }"
    )
    for pattern in guard_patterns:
        match = re.search(pattern, section)
        if match:
            section = section[:match.end()] + guard_code + section[match.end():]
            added = True
            break
    if not added:
        opening = section.find('{')
        section = section[:opening + 1] + guard_code + section[opening + 1:]

app = app[:start] + section + app[end:]

# mapStations: filtro solo abiertas.
start, end, section = function_block(app, 'function mapStations()')
open_filter = (
    "\n  if (el.mapOpenOnly?.checked) {\n"
    "    items = items.filter(station => station.isOpen === true);\n"
    "  }"
)
if 'el.mapOpenOnly?.checked' not in section:
    match = re.search(r'(\s*let\s+items\s*=\s*filteredStations\(\);)', section)
    if not match:
        match = re.search(r'(\s*(?:let|const)\s+items\s*=.*?;)', section)
    if not match:
        raise RuntimeError("No se encontró la lista inicial dentro de mapStations()")
    section = section[:match.end()] + open_filter + section[match.end():]
app = app[:start] + section + app[end:]

# Evita reabrir el mapa al cambiar favoritos dentro de una ficha.
app = re.sub(
    r"\n\s*if\s*\(document\.querySelector\([^\n]*data-page=[^\n]*map[^\n]*\)\)\s*\{\s*scheduleNativeMapSync\(\);\s*\}",
    '',
    app,
    flags=re.S,
)

# Listener del filtro.
listener = '''
el.mapOpenOnly?.addEventListener('change', () => {
  const modalOpen = Boolean(
    el.stationDialog?.open ||
    document.querySelector('dialog[open], .modal.is-open, .sheet.is-open, [aria-modal="true"]')
  );
  if (modalOpen) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return;
  }
  renderMap();
});
'''
if "el.mapOpenOnly?.addEventListener('change'" not in app:
    app += "\n" + listener

# Observer robusto: mapa siempre oculto mientras haya ficha/modal.
observer = '''
const nativeMapModalObserver = new MutationObserver(() => {
  const dialogOpen = Boolean(
    el.stationDialog?.open ||
    document.querySelector('dialog[open], .modal.is-open, .sheet.is-open, [aria-modal="true"]')
  );
  if (dialogOpen) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
    return;
  }
  if (document.querySelector('.page.is-active[data-page="map"], #page-map.is-active')) {
    window.setTimeout(() => scheduleNativeMapSync(), 140);
  }
});
nativeMapModalObserver.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['open', 'class', 'aria-hidden', 'aria-modal']
});
'''
if 'const nativeMapModalObserver' not in app:
    app += "\n" + observer

APP.write_text(app, encoding="utf-8")
print('OK: mapa, marcadores de precio y filtro de abiertas aplicados.')

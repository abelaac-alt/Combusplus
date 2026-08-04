#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
INDEX = ROOT / "web/index.html"
CSS = ROOT / "web/assets/styles.css"
GRADLE = ROOT / "android/app/build.gradle.kts"


def read(path: Path) -> str:
    if not path.is_file():
        raise RuntimeError(f"Falta el archivo requerido: {path}")
    return path.read_text(encoding="utf-8")


def replace_function(source: str, name: str, replacement: str) -> str:
    signatures = [
        f"async function {name}(",
        f"function {name}(",
    ]
    start = next(
        (
            source.find(signature)
            for signature in signatures
            if source.find(signature) >= 0
        ),
        -1,
    )

    if start < 0:
        raise RuntimeError(f"No se encontró la función {name}")

    opening = source.find("{", start)
    if opening < 0:
        raise RuntimeError(f"La función {name} no tiene cuerpo")

    depth = 0
    quote = None
    escaped = False

    for index in range(opening, len(source)):
        char = source[index]

        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in ("'", '"', "`"):
            quote = char
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return (
                    source[:start]
                    + replacement.strip()
                    + source[index + 1:]
                )

    raise RuntimeError(f"No se pudo cerrar la función {name}")


def insert_dom_reference(
    source: str,
    key: str,
    reference: str,
    candidates: list[str],
) -> str:
    if f"{key}:" in source:
        return source

    for candidate in candidates:
        position = source.find(candidate)
        if position >= 0:
            line_end = source.find("\n", position)
            if line_end < 0:
                line_end = len(source)
            line_start = source.rfind("\n", 0, position) + 1
            indent = re.match(
                r"\s*",
                source[line_start:position],
            ).group(0)
            return (
                source[:line_end]
                + f"\n{indent}{reference}"
                + source[line_end:]
            )

    raise RuntimeError(
        f"No se encontró un punto para añadir {reference}"
    )


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
index = read(INDEX)

map_search_html = '''
        <section class="map-search-card" aria-label="Buscar gasolineras en el mapa">
          <label class="map-search-field" for="mapSearch">
            <span>Buscar gasolinera</span>
            <div>
              <input
                id="mapSearch"
                type="search"
                autocomplete="off"
                placeholder="Nombre, marca, dirección o localidad"
              >
              <button id="clearMapSearch" type="button">Borrar</button>
            </div>
          </label>
        </section>
'''

if 'id="mapSearch"' not in index:
    anchors = [
        '<section class="map-filter-card"',
        '<section class="map-toolbar"',
        '<div id="googleMap"',
    ]
    position = next(
        (
            index.find(anchor)
            for anchor in anchors
            if index.find(anchor) >= 0
        ),
        -1,
    )
    if position < 0:
        raise RuntimeError(
            "No se encontró la sección donde insertar el buscador del mapa."
        )
    index = (
        index[:position]
        + map_search_html
        + "\n"
        + index[position:]
    )

best_filters_html = '''
          <section class="best-search-filters" aria-label="Filtros para encontrar la mejor gasolinera">
            <label class="best-search-name" for="quickStationQuery">
              <span>Nombre, marca o localidad</span>
              <input
                id="quickStationQuery"
                type="search"
                autocomplete="off"
                placeholder="Ej.: Repsol, BP, Sevilla…"
              >
            </label>
            <label class="best-search-open" for="quickOpenOnly">
              <input id="quickOpenOnly" type="checkbox">
              <span>Solo gasolineras abiertas</span>
            </label>
          </section>
'''

if 'id="quickStationQuery"' not in index:
    anchor = '<p id="quickSearchError"'
    position = index.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró quickSearchError para añadir los filtros."
        )
    index = (
        index[:position]
        + best_filters_html
        + "\n          "
        + index[position:]
    )

best_discount_html = '''
          <div
            id="bestDiscountBadge"
            class="best-discount-badge"
            hidden
            aria-live="polite"
          ></div>
'''

if 'id="bestDiscountBadge"' not in index:
    anchor = '<div class="saving-strip">'
    position = index.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró saving-strip para mostrar el descuento."
        )
    index = (
        index[:position]
        + best_discount_html
        + "\n          "
        + index[position:]
    )

INDEX.write_text(index, encoding="utf-8")


# ---------------------------------------------------------------------------
# JAVASCRIPT
# ---------------------------------------------------------------------------
app = read(APP)

app = insert_dom_reference(
    app,
    "quickStationQuery",
    "quickStationQuery: $('#quickStationQuery'),",
    [
        "searchStations: $('#searchStations'),",
        "quickSearchButton: $('#quickSearchButton'),",
    ],
)
app = insert_dom_reference(
    app,
    "quickOpenOnly",
    "quickOpenOnly: $('#quickOpenOnly'),",
    [
        "quickStationQuery: $('#quickStationQuery'),",
    ],
)
app = insert_dom_reference(
    app,
    "bestDiscountBadge",
    "bestDiscountBadge: $('#bestDiscountBadge'),",
    [
        "bestRefuelCost: $('#bestRefuelCost'),",
        "bestPrice: $('#bestPrice'),",
    ],
)
app = insert_dom_reference(
    app,
    "mapSearch",
    "mapSearch: $('#mapSearch'),",
    [
        "refreshMap: $('#refreshMap'),",
        "googleMap: $('#googleMap'),",
    ],
)
app = insert_dom_reference(
    app,
    "clearMapSearch",
    "clearMapSearch: $('#clearMapSearch'),",
    [
        "mapSearch: $('#mapSearch'),",
    ],
)

if "stationQuery:" not in app:
    default_filter_pattern = re.compile(
        r"(\s*tripMode:\s*'roundtrip')(\s*\n\};)"
    )
    match = default_filter_pattern.search(app)
    if not match:
        raise RuntimeError(
            "No se encontró DEFAULT_FILTERS.tripMode."
        )
    replacement = (
        match.group(1)
        + ",\n  stationQuery: '',\n"
        + "  searchOpenOnly: false"
        + match.group(2)
    )
    app = (
        app[:match.start()]
        + replacement
        + app[match.end():]
    )

helpers = r'''
function normalizedSearchV105(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function stationMatchesQueryV105(station, query) {
  const needle = normalizedSearchV105(query);
  if (!needle) return true;

  const haystack = normalizedSearchV105(
    `${station?.name || ''} ${station?.brand || ''} ${station?.address || ''}`
  );
  return haystack.includes(needle);
}

function stationMatchesBestFiltersV105(station, input) {
  if (input?.openOnly && station?.isOpen !== true) {
    return false;
  }
  return stationMatchesQueryV105(
    station,
    input?.stationQuery || ''
  );
}

function discountDisplayV105(station, fuelKey) {
  const discount = Number(
    station?.discount ??
    discountForStation(
      station,
      fuelKey,
      state.discounts
    )
  );

  const basePrice = Number(
    station?.basePrice ??
    stationBasePrice(station, fuelKey)
  );

  if (!Number.isFinite(discount) || discount <= 0) {
    return null;
  }

  const personal = Number(
    station?.price ??
    stationPrice(station, fuelKey)
  );

  return {
    discount,
    basePrice:
      Number.isFinite(basePrice)
        ? basePrice
        : (
            Number.isFinite(personal)
              ? personal + discount
              : null
          ),
    personal:
      Number.isFinite(personal)
        ? personal
        : null
  };
}
'''

if "function normalizedSearchV105(" not in app:
    anchor = "function filteredStations()"
    position = app.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró filteredStations para añadir los filtros."
        )
    app = app[:position] + helpers + "\n" + app[position:]

current_search_input = r'''
function currentSearchInput() {
  const vehicle = state.vehicles.find(
    item => item.id === el.quickVehicle.value
  ) || null;
  const selectedTrip =
    $('input[name="quickTrip"]:checked')?.value ||
    'roundtrip';
  const fullTank =
    selectedSearchMode() === 'fullTank';

  return {
    vehicle,
    vehicleId: vehicle?.id || '',
    fuelKey: vehicle?.fuelKey || el.quickFuel.value,
    consumption: Number(
      vehicle?.consumption ??
      el.quickConsumption.value
    ),
    tankCapacity: Number(
      vehicle?.tank ??
      el.quickTankCapacity?.value
    ),
    amount: Number(el.quickAmount.value),
    radius: Number(el.quickRadius.value),
    tripMode: selectedTrip,
    discounts: state.discounts,
    fullTank,
    stationQuery:
      el.quickStationQuery?.value.trim() || '',
    openOnly: Boolean(el.quickOpenOnly?.checked)
  };
}
'''
app = replace_function(
    app,
    "currentSearchInput",
    current_search_input,
)

sync_search_controls = r'''
function syncSearchControls(input) {
  state.filters.fuelKey = input.fuelKey;
  state.filters.consumption = input.consumption;
  state.filters.amount = input.amount;
  state.filters.radius = input.radius;
  state.filters.tripMode = input.tripMode;
  state.filters.stationQuery =
    String(input.stationQuery || '');
  state.filters.searchOpenOnly =
    Boolean(input.openOnly);

  el.listFuel.value = input.fuelKey;
  el.listRadius.value = String(input.radius);

  if (el.quickStationQuery) {
    el.quickStationQuery.value =
      state.filters.stationQuery;
  }
  if (el.quickOpenOnly) {
    el.quickOpenOnly.checked =
      state.filters.searchOpenOnly;
  }

  saveFilters();
}
'''
app = replace_function(
    app,
    "syncSearchControls",
    sync_search_controls,
)

recommendation_request = r'''
function recommendationRequest(
  input,
  selectedStationId = ''
) {
  if (!state.position) {
    throw new Error(
      'La ubicación todavía no está disponible.'
    );
  }

  return {
    latitude: state.position.latitude,
    longitude: state.position.longitude,
    radius: input.radius,
    limit: 100,
    fuelKey: input.fuelKey,
    consumption: input.consumption,
    amount: input.amount,
    tankCapacity: input.tankCapacity,
    tripMode: input.tripMode,
    fullTank: Boolean(input.fullTank),
    discounts: state.discounts,
    stationQuery:
      String(input.stationQuery || '').trim() ||
      undefined,
    openOnly:
      Boolean(input.openOnly) || undefined,
    selectedStationId:
      selectedStationId || undefined
  };
}
'''
app = replace_function(
    app,
    "recommendationRequest",
    recommendation_request,
)

fetch_recommendation = r'''
async function fetchRecommendation(input) {
  await requestPosition();

  const payload = await apiFetch(
    'recommend',
    '',
    {
      method: 'POST',
      body: recommendationRequest(input)
    }
  );

  const originalItems =
    Array.isArray(payload.items)
      ? payload.items
      : [];

  const items = originalItems.filter(
    station =>
      stationMatchesBestFiltersV105(
        station,
        input
      )
  );

  state.stations = items;
  if (items.length) {
    recordSnapshots(items);
  }

  if (!items.length) {
    const filterCopy = [
      input.openOnly
        ? 'que estén abiertas'
        : '',
      input.stationQuery
        ? `que coincidan con «${input.stationQuery}»`
        : ''
    ].filter(Boolean).join(' y ');

    throw new Error(
      filterCopy
        ? `No hay gasolineras ${filterCopy} dentro del radio seleccionado.`
        : 'No hay gasolineras compatibles dentro del radio seleccionado.'
    );
  }

  const serverBest = payload.best;
  const serverBestAllowed =
    serverBest &&
    items.some(
      station =>
        String(station.id) ===
        String(serverBest.id)
    );

  let best = serverBestAllowed
    ? serverBest
    : null;

  if (!best) {
    try {
      best = rankStations(items, input)[0] || null;
    } catch {
      best = null;
    }
  }

  if (!best) {
    best = items[0];
  }

  const nearest = [...items].sort(
    (a, b) =>
      Number(a.distanceKm || 9999) -
      Number(b.distanceKm || 9999)
  )[0] || best;

  let saving = 0;
  try {
    saving = equivalentSaving(best, nearest);
  } catch {
    saving = 0;
  }

  return {
    ...payload,
    items,
    best,
    nearest,
    saving:
      Number.isFinite(Number(payload.saving)) &&
      serverBestAllowed
        ? Number(payload.saving)
        : Number(saving || 0)
  };
}
'''
app = replace_function(
    app,
    "fetchRecommendation",
    fetch_recommendation,
)

filtered_stations = r'''
function filteredStations() {
  let items = state.stations.filter(
    station => stationPrice(station)
  );

  const query =
    state.filters.stationQuery || '';

  if (query) {
    items = items.filter(
      station =>
        stationMatchesQueryV105(
          station,
          query
        )
    );
  }

  if (
    state.filters.searchOpenOnly ||
    state.filters.openFilter === 'open'
  ) {
    items = items.filter(
      station => station.isOpen === true
    );
  }

  if (state.filters.sort === 'effective') {
    return rankStations(items, rankingInput());
  }

  const fuelKey = state.filters.fuelKey;
  items.sort((a, b) => {
    if (state.filters.sort === 'distance') {
      return a.distanceKm - b.distanceKm;
    }
    if (state.filters.sort === 'name') {
      return a.name.localeCompare(b.name, 'es');
    }
    return (
      (stationBasePrice(a, fuelKey) || 99) -
      (stationBasePrice(b, fuelKey) || 99)
    );
  });

  return items;
}
'''
app = replace_function(
    app,
    "filteredStations",
    filtered_stations,
)

map_stations = r'''
function mapStations() {
  let items = state.stations.filter(
    station =>
      stationPrice(station) &&
      Number.isFinite(station.latitude) &&
      Number.isFinite(station.longitude)
  );

  const query =
    el.mapSearch?.value.trim() || '';

  if (query) {
    items = items.filter(
      station =>
        stationMatchesQueryV105(
          station,
          query
        )
    );
  }

  if (el.mapOpenOnly?.checked) {
    items = items.filter(
      station => station.isOpen === true
    );
  }

  return items;
}
'''

if (
    "function mapStations(" in app or
    "async function mapStations(" in app
):
    app = replace_function(
        app,
        "mapStations",
        map_stations,
    )
else:
    anchors = [
        "function renderNativeEmbeddedMap(",
        "async function renderMap(",
    ]
    position = next(
        (
            app.find(anchor)
            for anchor in anchors
            if app.find(anchor) >= 0
        ),
        -1,
    )
    if position < 0:
        raise RuntimeError(
            "No se encontró dónde crear mapStations."
        )
    app = app[:position] + map_stations + "\n" + app[position:]

# Hacer visible el descuento en la mejor opción.
function_start = next(
    (
        app.find(signature)
        for signature in (
            "function renderBestResult(",
            "async function renderBestResult(",
        )
        if app.find(signature) >= 0
    ),
    -1,
)
if function_start < 0:
    raise RuntimeError("No se encontró renderBestResult")

opening = app.find("{", function_start)
depth = 0
quote = None
escaped = False
function_end = -1

for index_js in range(opening, len(app)):
    char = app[index_js]

    if quote:
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == quote:
            quote = None
        continue

    if char in ("'", '"', "`"):
        quote = char
        continue

    if char == "{":
        depth += 1
    elif char == "}":
        depth -= 1
        if depth == 0:
            function_end = index_js + 1
            break

if function_end < 0:
    raise RuntimeError("No se pudo cerrar renderBestResult")

section = app[function_start:function_end]

if "discountInfoV105" not in section:
    price_pattern = re.compile(
        r"(\s*el\.bestPrice\.textContent\s*=\s*[^;]+;)"
    )
    match = price_pattern.search(section)
    if not match:
        raise RuntimeError(
            "No se encontró el precio principal de la mejor opción."
        )

    discount_code = r'''
  const discountInfoV105 = discountDisplayV105(
    best,
    simulation.input.fuelKey
  );

  if (el.bestDiscountBadge) {
    if (discountInfoV105) {
      const beforeCopy =
        Number.isFinite(discountInfoV105.basePrice)
          ? ` · Precio sin descuento: ${num(discountInfoV105.basePrice)} €/l`
          : '';

      el.bestDiscountBadge.textContent =
        `DESCUENTO APLICADO: −${num(discountInfoV105.discount)} €/l${beforeCopy}`;
      el.bestDiscountBadge.hidden = false;
    } else {
      el.bestDiscountBadge.hidden = true;
      el.bestDiscountBadge.textContent = '';
    }
  }
'''
    section = (
        section[:match.end()]
        + "\n"
        + discount_code
        + section[match.end():]
    )
    app = (
        app[:function_start]
        + section
        + app[function_end:]
    )

listeners = r'''
/* Combusplus 10.5: buscadores y filtros */
let mapSearchTimerV105 = 0;

el.mapSearch?.addEventListener('input', () => {
  window.clearTimeout(mapSearchTimerV105);
  mapSearchTimerV105 = window.setTimeout(
    () => renderMap(false),
    220
  );
});

el.mapSearch?.addEventListener('search', () => {
  renderMap(false);
});

el.clearMapSearch?.addEventListener('click', () => {
  if (el.mapSearch) {
    el.mapSearch.value = '';
    el.mapSearch.focus();
  }
  renderMap(false);
});

el.mapOpenOnly?.addEventListener('change', () => {
  renderMap(false);
});

el.quickStationQuery?.addEventListener('input', () => {
  state.filters.stationQuery =
    el.quickStationQuery.value.trim();
  saveFilters();
});

el.quickOpenOnly?.addEventListener('change', () => {
  state.filters.searchOpenOnly =
    Boolean(el.quickOpenOnly.checked);
  saveFilters();
});

function restoreSearchFiltersV105() {
  if (el.quickStationQuery) {
    el.quickStationQuery.value =
      state.filters.stationQuery || '';
  }
  if (el.quickOpenOnly) {
    el.quickOpenOnly.checked =
      Boolean(state.filters.searchOpenOnly);
  }
}

document.addEventListener(
  'DOMContentLoaded',
  () => window.setTimeout(
    restoreSearchFiltersV105,
    0
  )
);

window.addEventListener(
  'load',
  restoreSearchFiltersV105
);
'''

if "let mapSearchTimerV105" not in app:
    app += "\n" + listeners

APP.write_text(app, encoding="utf-8")


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
styles = read(CSS)

css = r'''
/* Combusplus 10.5: buscadores, filtros y descuentos */
.map-search-card,
.best-search-filters{
  width:100%;
  margin:0 0 12px;
  padding:14px 16px;
  border:1px solid #d8dbe0;
  border-radius:12px;
  background:#fff;
  box-sizing:border-box;
}

.map-search-field{
  display:grid;
  gap:8px;
  font-weight:800;
}

.map-search-field > div{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
}

.map-search-field input,
.best-search-name input{
  width:100%;
  min-width:0;
  min-height:48px;
  padding:0 14px;
  border:1px solid #cbd0d7;
  border-radius:10px;
  background:#fff;
  color:#17191d;
  font:inherit;
  box-sizing:border-box;
}

.map-search-field button{
  min-height:48px;
  padding:0 16px;
  border:1px solid #cbd0d7;
  border-radius:10px;
  background:#fff;
  color:#17191d;
  font-weight:800;
}

.best-search-filters{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:end;
  gap:14px;
}

.best-search-name{
  display:grid;
  gap:8px;
  min-width:0;
  font-weight:800;
}

.best-search-open{
  min-height:48px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:0 12px;
  border:1px solid #cbd0d7;
  border-radius:10px;
  font-weight:800;
  white-space:nowrap;
}

.best-search-open input{
  width:22px;
  height:22px;
  accent-color:#d1131b;
}

.best-discount-badge{
  margin:12px 0;
  padding:12px 14px;
  border:1px solid #f2c14e;
  border-radius:10px;
  background:#fff6d8;
  color:#6b4a00;
  font-weight:900;
  line-height:1.35;
}

.station-discount:not(:empty){
  display:inline-flex;
  width:max-content;
  max-width:100%;
  margin-top:5px;
  padding:5px 9px;
  border-radius:999px;
  background:#fff1bd;
  color:#6b4a00;
  font-weight:850;
}

@media(max-width:620px){
  .best-search-filters{
    grid-template-columns:1fr;
  }

  .best-search-open{
    white-space:normal;
  }

  .map-search-field > div{
    grid-template-columns:minmax(0,1fr) 96px;
  }
}
'''

if "Combusplus 10.5: buscadores" not in styles:
    styles += "\n" + css

CSS.write_text(styles, encoding="utf-8")


# ---------------------------------------------------------------------------
# GRADLE: versiones configurables para Google Play
# ---------------------------------------------------------------------------
gradle = read(GRADLE)

if 'COMBUSPLUS_VERSION_CODE' not in gradle:
    anchor = (
        'val playIntegrityProjectNumber = '
        'providers.gradleProperty('
        '"PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER"'
        ').orElse("0")'
    )
    position = gradle.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER."
        )
    line_end = gradle.find("\n", position)
    gradle = (
        gradle[:line_end + 1]
        + 'val releaseVersionCode = providers.gradleProperty("COMBUSPLUS_VERSION_CODE").orElse("50")\n'
        + 'val releaseVersionName = providers.gradleProperty("COMBUSPLUS_VERSION_NAME").orElse("10.5.0")\n'
        + gradle[line_end + 1:]
    )

gradle = re.sub(
    r"versionCode\s*=\s*\d+",
    "versionCode = releaseVersionCode.get().toInt()",
    gradle,
    count=1,
)

gradle = re.sub(
    r'versionName\s*=\s*"[^"]+"',
    "versionName = releaseVersionName.get()",
    gradle,
    count=1,
)

gradle = re.sub(
    r"version:\s*'[^']+'",
    "version: '${jsString(releaseVersionName.get())}'",
    gradle,
    count=1,
)

GRADLE.write_text(gradle, encoding="utf-8")

print("Combusplus 10.5 aplicado correctamente.")

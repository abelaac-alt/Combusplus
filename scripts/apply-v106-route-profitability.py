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
        if position < 0:
            continue

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
        f"No se encontró dónde añadir {reference}"
    )


index = read(INDEX)

destination_html = '''
          <div class="search-step route-destination-step">
            <span class="step-number">2</span>
            <div class="step-copy">
              <strong>Indica a dónde vas</strong>
              <small>Calcularemos gasolineras cercanas a tu ruta y el desvío real.</small>
            </div>
          </div>

          <label class="field main-field route-destination-field">
            <span>Dirección de destino</span>
            <input
              id="quickDestination"
              type="search"
              autocomplete="street-address"
              placeholder="Ej.: Calle, ciudad o punto de destino"
              required
            >
          </label>
'''

if 'id="quickDestination"' not in index:
    anchor = '<div class="search-step second-step">'
    position = index.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró el segundo paso del buscador."
        )
    index = (
        index[:position]
        + destination_html
        + "\n          "
        + index[position:]
    )

index = re.sub(
    r'(<div class="search-step second-step">\s*'
    r'<span class="step-number">)2(</span>)',
    r'\g<1>3\2',
    index,
    count=1,
)

index = re.sub(
    r'<label class="field"><span>Radio máximo</span>'
    r'<div class="input-unit"><input id="quickRadius"'
    r' type="number" min="1" max="50" step="1" value="15"'
    r' inputmode="numeric"><em>km</em></div></label>',
    '<label class="field route-detour-field">'
    '<span>Desvío máximo permitido</span>'
    '<div class="input-unit">'
    '<input id="quickRadius" type="number" min="0.5" max="25" '
    'step="0.5" value="5" inputmode="decimal">'
    '<em>km</em></div>'
    '<small>Distancia adicional máxima respecto a la ruta directa.</small>'
    '</label>',
    index,
    count=1,
)

index = index.replace(
    '<label class="compact-field"><span>Radio</span>'
    '<select id="listRadius">',
    '<label class="compact-field"><span>Desvío máx.</span>'
    '<select id="listRadius">',
)

route_summary_html = '''
          <section
            id="bestRouteSummary"
            class="best-route-summary"
            hidden
            aria-live="polite"
          ></section>
'''

if 'id="bestRouteSummary"' not in index:
    if '<div id="bestDiscountBadge"' in index:
        start = index.find('<div id="bestDiscountBadge"')
        closing = index.find('</div>', start)
        position = closing + len('</div>') if closing >= 0 else -1
    else:
        position = -1

    if position < 0:
        position = index.find('<div class="saving-strip">')

    if position < 0:
        raise RuntimeError(
            "No se encontró dónde insertar el resumen de ruta."
        )

    index = (
        index[:position]
        + "\n"
        + route_summary_html
        + index[position:]
    )

INDEX.write_text(index, encoding="utf-8")

app = read(APP)

app = insert_dom_reference(
    app,
    "quickDestination",
    "quickDestination: $('#quickDestination'),",
    [
        "quickVehicle: $('#quickVehicle'),",
        "quickRadius: $('#quickRadius'),",
    ],
)
app = insert_dom_reference(
    app,
    "bestRouteSummary",
    "bestRouteSummary: $('#bestRouteSummary'),",
    [
        "bestRefuelCost: $('#bestRefuelCost'),",
        "bestDiscountBadge: $('#bestDiscountBadge'),",
    ],
)

default_filters = app.split("const DEFAULT_FILTERS", 1)[1].split("};", 1)[0]
if "destination:" not in default_filters:
    pattern = re.compile(
        r"(\s*searchOpenOnly:\s*false)(\s*\n\};)"
    )
    match = pattern.search(app)
    if not match:
        raise RuntimeError(
            "No se encontró DEFAULT_FILTERS.searchOpenOnly."
        )
    replacement = (
        match.group(1)
        + ",\n  destination: '',\n"
        + "  maxDetourKm: 5"
        + match.group(2)
    )
    app = (
        app[:match.start()]
        + replacement
        + app[match.end():]
    )

route_helpers = r'''
function routeMapsUrlV106(station, destination) {
  if (
    !Number.isFinite(Number(state.position?.latitude)) ||
    !Number.isFinite(Number(state.position?.longitude)) ||
    !Number.isFinite(Number(station?.latitude)) ||
    !Number.isFinite(Number(station?.longitude))
  ) {
    return mapsUrl(station);
  }

  const query = new URLSearchParams({
    api: '1',
    origin:
      `${state.position.latitude},${state.position.longitude}`,
    destination: String(destination || ''),
    waypoints:
      `${station.latitude},${station.longitude}`,
    travelmode: 'driving'
  });

  return `https://www.google.com/maps/dir/?${query}`;
}

function routeTimeLabelV106(seconds) {
  const minutes = Math.max(
    0,
    Math.round(Number(seconds || 0) / 60)
  );

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining
    ? `${hours} h ${remaining} min`
    : `${hours} h`;
}

function renderRouteSummaryV106(simulation) {
  if (!el.bestRouteSummary) return;

  const best = simulation?.best;
  if (!simulation?.routeBased || !best) {
    el.bestRouteSummary.hidden = true;
    el.bestRouteSummary.replaceChildren();
    return;
  }

  const stopCopy =
    best.stopLeg === 'return'
      ? 'parada recomendada durante la vuelta'
      : 'parada recomendada durante la ida';

  el.bestRouteSummary.innerHTML = `
    <div>
      <span>Destino</span>
      <strong>${escapeHtml(simulation.input.destination)}</strong>
    </div>
    <div>
      <span>Ruta total</span>
      <strong>${num(Number(best.routeTotalKm), 1)} km</strong>
    </div>
    <div>
      <span>Desvío adicional</span>
      <strong>${num(Number(best.detourKm), 1)} km</strong>
    </div>
    <div>
      <span>Tiempo estimado</span>
      <strong>${routeTimeLabelV106(best.routeDurationSeconds)}</strong>
    </div>
    <p>${escapeHtml(stopCopy)} · El consumo del vehículo y los descuentos están incluidos en el cálculo.</p>
  `;
  el.bestRouteSummary.hidden = false;
}
'''

if "function routeMapsUrlV106(" not in app:
    anchor = "function currentSearchInput()"
    position = app.find(anchor)
    if position < 0:
        raise RuntimeError(
            "No se encontró currentSearchInput."
        )
    app = app[:position] + route_helpers + "\n" + app[position:]

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
    maxDetourKm: Number(el.quickRadius.value),
    destination:
      el.quickDestination?.value.trim() || '',
    tripMode: selectedTrip,
    discounts: state.discounts,
    fullTank,
    stationQuery:
      el.quickStationQuery?.value.trim() || '',
    openOnly: Boolean(el.quickOpenOnly?.checked)
  };
}
'''
app = replace_function(app, "currentSearchInput", current_search_input)

sync_search_controls = r'''
function syncSearchControls(input) {
  state.filters.fuelKey = input.fuelKey;
  state.filters.consumption = input.consumption;
  state.filters.amount = input.amount;
  state.filters.radius = input.maxDetourKm;
  state.filters.maxDetourKm = input.maxDetourKm;
  state.filters.destination =
    String(input.destination || '');
  state.filters.tripMode = input.tripMode;
  state.filters.stationQuery =
    String(input.stationQuery || '');
  state.filters.searchOpenOnly =
    Boolean(input.openOnly);

  el.listFuel.value = input.fuelKey;
  el.listRadius.value = String(input.maxDetourKm);

  if (el.quickDestination) {
    el.quickDestination.value =
      state.filters.destination;
  }

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
app = replace_function(app, "syncSearchControls", sync_search_controls)

validate_search = r'''
function validateSearch(input) {
  if (
    !String(input.destination || '').trim() ||
    String(input.destination || '').trim().length < 3
  ) {
    return 'Indica la dirección a la que quieres ir.';
  }

  if (
    !Number.isFinite(input.consumption) ||
    input.consumption < 1 ||
    input.consumption > 30
  ) {
    return 'Indica un consumo entre 1 y 30 l/100 km.';
  }

  if (input.fullTank) {
    if (
      !Number.isFinite(input.tankCapacity) ||
      input.tankCapacity < 10 ||
      input.tankCapacity > 200
    ) {
      return 'Indica una capacidad de depósito entre 10 y 200 litros.';
    }
  } else if (
    !Number.isFinite(input.amount) ||
    input.amount < 5 ||
    input.amount > 500
  ) {
    return 'Indica un importe entre 5 € y 500 €.';
  }

  if (
    !Number.isFinite(input.maxDetourKm) ||
    input.maxDetourKm < 0.5 ||
    input.maxDetourKm > 25
  ) {
    return 'Indica un desvío máximo entre 0,5 y 25 km.';
  }

  return '';
}
'''
app = replace_function(app, "validateSearch", validate_search)

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
    destination:
      String(input.destination || '').trim(),
    radius: input.maxDetourKm,
    maxDetourKm: input.maxDetourKm,
    limit: 30,
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
app = replace_function(app, "recommendationRequest", recommendation_request)

fetch_recommendation = r'''
async function fetchRecommendation(input) {
  await requestPosition();

  const payload = await apiFetch(
    'route-recommend',
    '',
    {
      method: 'POST',
      body: recommendationRequest(input)
    }
  );

  state.stations =
    Array.isArray(payload.items)
      ? payload.items
      : [];

  if (state.stations.length) {
    recordSnapshots(state.stations);
  }

  if (!payload.best) {
    throw new Error(
      'No hay gasolineras rentables en la ruta con el desvío seleccionado.'
    );
  }

  return payload;
}
'''
app = replace_function(app, "fetchRecommendation", fetch_recommendation)

run_full_tank = r'''
async function runFullTankSearch({
  openRoute = false
} = {}) {
  clearError(el.quickSearchError);

  const vehicle = activeVehicle();
  if (
    !vehicle ||
    !Number.isFinite(Number(vehicle.tank)) ||
    Number(vehicle.tank) <= 0
  ) {
    toast(
      'Añade un vehículo con la capacidad de su depósito.'
    );
    openVehicleDialog(vehicle || null);
    return;
  }

  const destination =
    el.quickDestination?.value.trim() ||
    state.filters.destination ||
    '';

  if (!destination) {
    navigate('list');
    toast(
      'Indica primero la dirección a la que quieres ir.'
    );
    window.setTimeout(
      () => el.quickDestination?.focus(),
      180
    );
    return;
  }

  const input = {
    vehicle,
    vehicleId: vehicle.id,
    fuelKey: vehicle.fuelKey,
    consumption: Number(vehicle.consumption),
    tankCapacity: Number(vehicle.tank),
    amount: 0,
    radius:
      Number(el.quickRadius.value) ||
      Number(state.filters.maxDetourKm) ||
      5,
    maxDetourKm:
      Number(el.quickRadius.value) ||
      Number(state.filters.maxDetourKm) ||
      5,
    destination,
    tripMode:
      $('input[name="quickTrip"]:checked')?.value ||
      state.filters.tripMode ||
      'roundtrip',
    discounts: state.discounts,
    stationQuery:
      el.quickStationQuery?.value.trim() || '',
    openOnly: Boolean(el.quickOpenOnly?.checked),
    fullTank: true
  };

  const error = validateSearch(input);
  if (error) {
    toast(error);
    return;
  }

  syncSearchControls({
    ...input,
    amount: state.filters.amount || 50
  });

  if (el.fullTankButton) {
    el.fullTankButton.disabled = true;
    const label =
      el.fullTankButton.querySelector('span');
    if (label) {
      label.textContent =
        'Calculando la mejor parada de la ruta…';
    }
  }

  el.stationList.innerHTML =
    '<div class="loading">Calculando ruta, desvíos, descuentos y consumo…</div>';
  el.bestResult.hidden = true;

  try {
    const payload = await fetchRecommendation(input);
    const best = payload.best;
    const nearest = payload.nearest || best;
    const saving = Number(payload.saving || 0);

    input.amount = Number(
      best.tankCost ||
      input.tankCapacity * best.price
    );

    state.currentSimulation = {
      best,
      nearest,
      saving,
      input,
      mode: 'fullTank',
      radius: input.maxDetourKm,
      vehicleId: vehicle.id,
      registered: false,
      serverCalculated: true,
      routeBased: true,
      route: payload.route || null
    };

    renderBestResult();
    renderStations();
    renderMapPreview();
    await checkFavoritePrices(false);

    state.analytics.cityApprox =
      approximateCityFromAddress(best.address);

    sendAnalyticsEvent(
      'route_full_tank_search',
      {
        tripMode: input.tripMode,
        maxDetourKm: input.maxDetourKm
      }
    );

    el.bestResult.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    toast(
      'Mejor parada calculada según ruta, precio y consumo.'
    );

    if (openRoute) {
      window.setTimeout(() => {
        window.location.href =
          routeMapsUrlV106(best, destination);
      }, 250);
    }
  } catch (searchError) {
    el.stationList.replaceChildren(
      emptyState(searchError.message)
    );
    showError(
      el.quickSearchError,
      searchError.message
    );
  } finally {
    if (el.fullTankButton) {
      el.fullTankButton.disabled = false;
      const label =
        el.fullTankButton.querySelector('span');
      if (label) {
        label.textContent =
          'Buscar la mejor gasolinera';
      }
    }
  }
}
'''
app = replace_function(app, "runFullTankSearch", run_full_tank)

app = re.sub(
    r"(serverCalculated:\s*true)(\s*\n\s*\};)",
    r"\1,\n      routeBased: true,\n      route: payload.route || null\2",
    app,
)

if "renderRouteSummaryV106(simulation);" not in app:
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
        raise RuntimeError(
            "No se encontró renderBestResult."
        )

    function_open = app.find("{", function_start)
    depth = 0
    quote = None
    escaped = False
    function_end = -1

    for index_js in range(function_open, len(app)):
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

    section = app[function_start:function_end]
    anchor = re.search(
        r"(\s*el\.bestSaving\.textContent\s*=\s*[^;]+;)",
        section,
    )
    if not anchor:
        anchor = re.search(
            r"(\s*el\.bestResult\.hidden\s*=\s*false;)",
            section,
        )
    if not anchor:
        raise RuntimeError(
            "No se encontró dónde actualizar el resumen de ruta."
        )

    section = (
        section[:anchor.start()]
        + "\n  renderRouteSummaryV106(simulation);\n"
        + section[anchor.start():]
    )

    section = section.replace(
        "el.bestRoute.href = mapsUrl(best);",
        "el.bestRoute.href = routeMapsUrlV106("
        "best, simulation.input.destination"
        ");",
    )

    app = (
        app[:function_start]
        + section
        + app[function_end:]
    )

app = app.replace(
    "el.bestRoute.href = mapsUrl(best);",
    "el.bestRoute.href = routeMapsUrlV106("
    "best, simulation.input.destination"
    ");",
)

app = app.replace(
    "node.querySelector('.station-distance').textContent = "
    "`${num(station.distanceKm, 1)} km`;",
    "node.querySelector('.station-distance').textContent = "
    "Number.isFinite(Number(station.detourKm)) "
    "? `Desvío ${num(Number(station.detourKm), 1)} km` "
    ": `${num(station.distanceKm, 1)} km`;",
)

restore = r'''
/* Combusplus 10.6: destino y desvío */
function restoreRouteSearchV106() {
  if (el.quickDestination) {
    el.quickDestination.value =
      state.filters.destination || '';
  }

  if (el.quickRadius) {
    const value =
      Number(state.filters.maxDetourKm) ||
      Number(state.filters.radius) ||
      5;
    el.quickRadius.value = String(value);
  }
}

el.quickDestination?.addEventListener(
  'change',
  () => {
    state.filters.destination =
      el.quickDestination.value.trim();
    saveFilters();
  }
);

el.quickRadius?.addEventListener(
  'change',
  () => {
    state.filters.maxDetourKm =
      Number(el.quickRadius.value) || 5;
    saveFilters();
  }
);

document.addEventListener(
  'DOMContentLoaded',
  () => window.setTimeout(
    restoreRouteSearchV106,
    0
  )
);

window.addEventListener(
  'load',
  restoreRouteSearchV106
);
'''

if "function restoreRouteSearchV106(" not in app:
    app += "\n" + restore

APP.write_text(app, encoding="utf-8")

styles = read(CSS)
css = r'''
/* Combusplus 10.6: búsqueda rentable por ruta */
.route-destination-step{
  margin-top:22px;
}

.route-destination-field input{
  width:100%;
  min-height:50px;
  padding:0 14px;
  border:1px solid #cbd0d7;
  border-radius:10px;
  background:#fff;
  color:#17191d;
  font:inherit;
  box-sizing:border-box;
}

.route-detour-field small{
  display:block;
  margin-top:6px;
  color:#747982;
  font-size:12px;
  line-height:1.35;
}

.best-route-summary{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
  margin:12px 0;
  padding:14px;
  border:1px solid #d7dbe1;
  border-radius:12px;
  background:#f8f9fb;
}

.best-route-summary[hidden]{
  display:none !important;
}

.best-route-summary > div{
  min-width:0;
  display:grid;
  gap:4px;
  padding:10px;
  border-radius:10px;
  background:#fff;
}

.best-route-summary span{
  color:#777d86;
  font-size:11px;
  font-weight:750;
  text-transform:uppercase;
  letter-spacing:.04em;
}

.best-route-summary strong{
  color:#17191d;
  font-size:15px;
  overflow-wrap:anywhere;
}

.best-route-summary p{
  grid-column:1 / -1;
  margin:2px 0 0;
  color:#5f6570;
  font-size:12px;
  line-height:1.45;
}

@media(max-width:560px){
  .best-route-summary{
    grid-template-columns:1fr;
  }

  .best-route-summary p{
    grid-column:auto;
  }
}
'''

if "Combusplus 10.6: búsqueda rentable por ruta" not in styles:
    styles += "\n" + css

CSS.write_text(styles, encoding="utf-8")

gradle = read(GRADLE)
gradle = gradle.replace('.orElse("50")', '.orElse("51")')
gradle = gradle.replace('.orElse("10.5.0")', '.orElse("10.6.0")')
GRADLE.write_text(gradle, encoding="utf-8")

print("Combusplus 10.6 aplicado correctamente.")

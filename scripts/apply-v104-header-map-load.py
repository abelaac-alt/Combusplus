#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'web/src/app.js'
CSS = ROOT / 'web/assets/styles.css'


def replace_fn(src: str, name: str, replacement: str) -> str:
    starts = [
        src.find(f'async function {name}('),
        src.find(f'function {name}('),
    ]
    start = next((value for value in starts if value >= 0), -1)
    if start < 0:
        raise RuntimeError(f'No se encontró la función {name}')

    brace = src.find('{', start)
    depth = 0
    quote = None
    escaped = False

    for index in range(brace, len(src)):
        char = src[index]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in ("'", '"', '`'):
            quote = char
            continue
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return src[:start] + replacement.strip() + src[index + 1:]

    raise RuntimeError(f'No se pudo cerrar la función {name}')


app = APP.read_text(encoding='utf-8')

ensure_function = """async function ensureNearbyStationsForMap(force = false) {
  if (!force && state.stations.length > 0) return state.stations;

  if (el.mapModeLabel) {
    el.mapModeLabel.textContent = 'Buscando gasolineras cercanas…';
  }

  try {
    await requestPosition(Boolean(force));
    await fetchStations(Number(state.filters.radius) || 15);

    state.stations.sort(
      (a, b) =>
        Number(a.distanceKm || 9999) -
        Number(b.distanceKm || 9999)
    );

    if (typeof recordSnapshots === 'function') {
      recordSnapshots(state.stations);
    }

    return state.stations;
  } catch (error) {
    const message = error?.message ||
      'No se pudieron cargar las gasolineras cercanas.';

    if (el.mapModeLabel) {
      el.mapModeLabel.textContent = message;
    }

    throw new Error(message);
  }
}"""

if 'async function ensureNearbyStationsForMap(' in app:
    app = replace_fn(app, 'ensureNearbyStationsForMap', ensure_function)
else:
    marker = 'async function renderMap()'
    if marker not in app:
        raise RuntimeError('No se encontró renderMap')
    app = app.replace(marker, ensure_function + '\n\n' + marker, 1)

load_function = """function loadGoogleMaps() {
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (state.mapsPromise) return state.mapsPromise;

  const apiKey = String(
    state.settings.googleMapsKey ||
    RUNTIME_CONFIG.googleMapsKey ||
    ''
  ).trim();

  if (!apiKey) {
    return Promise.reject(
      new Error('Falta la clave de Google Maps para navegador.')
    );
  }

  document.getElementById('combusplus-google-maps')?.remove();

  state.mapsPromise = new Promise((resolve, reject) => {
    const callback = `combusplusMapsReady_${Date.now()}`;
    const previousAuthFailure = window.gm_authFailure;
    let finished = false;

    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);

      try { delete window[callback]; }
      catch { window[callback] = undefined; }

      window.gm_authFailure = previousAuthFailure;

      if (error) {
        state.mapsPromise = null;
        document.getElementById('combusplus-google-maps')?.remove();
        reject(error);
      } else {
        resolve(window.google.maps);
      }
    };

    window[callback] = () => {
      if (window.google?.maps?.Map) finish(null);
      else finish(new Error('Google Maps no terminó de cargarse.'));
    };

    window.gm_authFailure = () => finish(
      new Error('Google Maps ha rechazado la clave o sus restricciones.')
    );

    const script = document.createElement('script');
    script.id = 'combusplus-google-maps';
    script.async = true;
    script.defer = true;

    const query = new URLSearchParams({
      key: apiKey,
      callback,
      language: 'es',
      region: 'ES',
      v: 'weekly',
      loading: 'async',
      auth_referrer_policy: 'origin'
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.onerror = () => finish(
      new Error('No se pudo descargar Google Maps.')
    );

    document.head.appendChild(script);

    const timeout = setTimeout(
      () => finish(
        new Error('Google Maps ha tardado demasiado en responder.')
      ),
      20000
    );
  });

  return state.mapsPromise;
}"""

app = replace_fn(app, 'loadGoogleMaps', load_function)

render_function = """async function renderMap(force = false) {
  try {
    await ensureNearbyStationsForMap(force);

    const items = mapStations().filter(
      station =>
        Number.isFinite(station.latitude) &&
        Number.isFinite(station.longitude)
    );

    if (!items.length) {
      el.googleMap.replaceChildren(
        emptyState('No hay gasolineras disponibles en esta zona.')
      );
      el.mapModeLabel.textContent = '0 gasolineras';
      return;
    }

    const maps = await loadGoogleMaps();
    el.googleMap.replaceChildren();

    const center = state.position
      ? {
          lat: state.position.latitude,
          lng: state.position.longitude
        }
      : {
          lat: items[0].latitude,
          lng: items[0].longitude
        };

    const options = {
      center,
      zoom: 12,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      clickableIcons: false
    };

    const mapId = String(state.settings.googleMapId || '').trim();
    if (mapId && mapId !== 'DEMO_MAP_ID') options.mapId = mapId;

    state.map = new maps.Map(el.googleMap, options);
    state.markers.forEach(marker => marker.setMap?.(null));
    state.markers = [];

    const bounds = new maps.LatLngBounds();

    for (const station of items) {
      const price = stationPrice(station);
      const marker = new maps.Marker({
        position: {
          lat: station.latitude,
          lng: station.longitude
        },
        map: state.map,
        title: station.name,
        label: {
          text: Number.isFinite(price) ? `${num(price)}€` : '—',
          color: isFavorite(station.id) ? '#17191d' : '#ffffff',
          fontWeight: '700',
          fontSize: '11px'
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 25,
          fillColor: isFavorite(station.id) ? '#ffc107' : '#d71920',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      marker.addListener('click', () => openStationDetail(station));
      state.markers.push(marker);
      bounds.extend(marker.getPosition());
    }

    if (items.length === 1) {
      state.map.setCenter(bounds.getCenter());
      state.map.setZoom(14);
    } else {
      state.map.fitBounds(bounds, 42);
    }

    setTimeout(() => {
      maps.event.trigger(state.map, 'resize');
      if (items.length > 1) state.map.fitBounds(bounds, 42);
    }, 120);

    el.mapModeLabel.textContent = `${items.length} gasolineras`;
    renderMapPreview();
  } catch (error) {
    const message = error?.message || 'No se pudo cargar el mapa.';
    el.mapModeLabel.textContent = message;
    el.googleMap.replaceChildren();

    const panel = document.createElement('div');
    panel.className = 'map-load-error';
    panel.innerHTML = `
      <strong>No se pudo cargar el mapa</strong>
      <p>${escapeHtml(message)}</p>
      <button type="button">Reintentar mapa</button>
    `;

    panel.querySelector('button').addEventListener('click', () => {
      state.mapsPromise = null;
      state.map = null;
      renderMap(true);
    });

    el.googleMap.appendChild(panel);
  }
}"""

app = replace_fn(app, 'renderMap', render_function)
app = app.replace(
    "el.refreshMap.addEventListener('click', () => renderMap());",
    "el.refreshMap.addEventListener('click', () => renderMap(true));"
)
app = app.replace(
    "el.refreshMap?.addEventListener('click', () => renderMap());",
    "el.refreshMap?.addEventListener('click', () => renderMap(true));"
)
APP.write_text(app, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
css += r'''

/* Combusplus 10.4: cabecera alineada y carga del mapa */
.page[data-page="map"],
.page[data-page="map"].is-active{
  width:100% !important;
  padding:18px max(16px,var(--safe-right))
    calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 28px)
    max(16px,var(--safe-left)) !important;
  box-sizing:border-box !important;
}
.page[data-page="map"] .page-head{
  width:100% !important;
  margin:0 0 16px !important;
  padding:0 2px !important;
  box-sizing:border-box !important;
}
.page[data-page="map"] .page-head>*{min-width:0 !important;}
.page[data-page="map"] #refreshMap{margin-right:0 !important;}
.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card,
.page[data-page="map"] .map-toolbar,
.page[data-page="map"] #googleMap{
  width:100% !important;
  max-width:100% !important;
  margin-left:0 !important;
  margin-right:0 !important;
  box-sizing:border-box !important;
}
.page[data-page="map"] #googleMap{
  height:440px !important;
  min-height:440px !important;
  max-height:440px !important;
  margin-bottom:calc(var(--cp-v102-nav-height) + var(--safe-bottom) + 30px) !important;
}
.map-load-error{
  min-height:100%;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:10px;padding:24px;text-align:center;
  background:#f1f3f6;color:#17191d;
}
.map-load-error strong{font-size:20px;}
.map-load-error p{max-width:520px;margin:0;color:#646a73;}
.map-load-error button{
  min-height:46px;padding:0 20px;border:1px solid #c7cbd2;
  border-radius:8px;background:#fff;color:#17191d;font-weight:800;
}
@media(max-width:520px){
  .page[data-page="map"],.page[data-page="map"].is-active{
    padding-left:14px !important;padding-right:14px !important;
  }
  .page[data-page="map"] #googleMap{
    height:420px !important;min-height:420px !important;max-height:420px !important;
  }
}
'''
CSS.write_text(css, encoding='utf-8')
print('Combusplus 10.4 aplicado correctamente.')

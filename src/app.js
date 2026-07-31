import {
  extractStationArray,
  rankStations,
  equivalentSaving,
  mapsUrl
} from './core.js';

const API_BASE = 'https://api.precioil.es';
const API_KEY_STORAGE = 'repostaMejor.precioilBrowserKey';

const state = {
  position: null,
  ranked: []
};

const $ = selector => document.querySelector(selector);
const elements = {
  form: $('#calculatorForm'),
  consumption: $('#consumption'),
  fuelType: $('#fuelType'),
  amount: $('#amount'),
  radius: $('#radius'),
  locateButton: $('#locateButton'),
  locationTitle: $('#locationTitle'),
  locationText: $('#locationText'),
  formError: $('#formError'),
  calculateButton: $('#calculateButton'),
  loading: $('#loadingSection'),
  results: $('#resultsSection'),
  apiStatus: $('#apiStatus'),
  settingsDialog: $('#settingsDialog'),
  openSettings: $('#openSettings'),
  apiKeyInput: $('#apiKeyInput'),
  settingsError: $('#settingsError'),
  saveApiKey: $('#saveApiKey'),
  clearApiKey: $('#clearApiKey'),
  bestName: $('#bestName'),
  bestAddress: $('#bestAddress'),
  bestPrice: $('#bestPrice'),
  bestDistance: $('#bestDistance'),
  bestNetLiters: $('#bestNetLiters'),
  bestPurchased: $('#bestPurchased'),
  bestTripFuel: $('#bestTripFuel'),
  bestEffectivePrice: $('#bestEffectivePrice'),
  bestTripKm: $('#bestTripKm'),
  savingText: $('#savingText'),
  mapsLink: $('#mapsLink'),
  resultUpdated: $('#resultUpdated'),
  stationCount: $('#stationCount'),
  rankingList: $('#rankingList'),
  rankingTemplate: $('#rankingItemTemplate')
};

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const decimals = (value, digits = 2) => new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(value);

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE)?.trim() || '';
}

function setApiStatus() {
  const configured = Boolean(getApiKey());
  elements.apiStatus.textContent = configured ? 'API configurada' : 'API sin configurar';
  elements.apiStatus.classList.toggle('ready', configured);
}

function showError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function clearError() {
  elements.formError.hidden = true;
  elements.formError.textContent = '';
}

function showSettingsError(message) {
  elements.settingsError.textContent = message;
  elements.settingsError.hidden = false;
}

function clearSettingsError() {
  elements.settingsError.hidden = true;
  elements.settingsError.textContent = '';
}

function openSettings() {
  elements.apiKeyInput.value = getApiKey();
  clearSettingsError();
  elements.settingsDialog.showModal();
}

function saveApiKey() {
  const key = elements.apiKeyInput.value.trim();
  if (!key) {
    showSettingsError('Introduce una clave de navegador válida.');
    return;
  }
  if (key.startsWith('sk_live_')) {
    showSettingsError('Esta es una clave de servidor. Crea una browser key pk_live_ restringida a tu dominio.');
    return;
  }
  if (!key.startsWith('pk_live_')) {
    showSettingsError('La clave de navegador debe comenzar por pk_live_.');
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, key);
  setApiStatus();
  elements.settingsDialog.close();
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  elements.apiKeyInput.value = '';
  setApiStatus();
  showSettingsError('Clave eliminada de este dispositivo.');
}

function requestPosition() {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('Este navegador no permite obtener la ubicación.'));
  }
  elements.locationTitle.textContent = 'Obteniendo ubicación…';
  elements.locationText.textContent = 'Acepta el permiso de ubicación del navegador.';

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        state.position = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        elements.locationTitle.textContent = 'Ubicación preparada';
        elements.locationText.textContent = `Precisión aproximada: ${Math.round(position.coords.accuracy)} m`;
        resolve(state.position);
      },
      error => {
        elements.locationTitle.textContent = 'No se pudo obtener la ubicación';
        elements.locationText.textContent = 'Revisa el permiso de ubicación e inténtalo de nuevo.';
        const messages = {
          1: 'Has bloqueado el permiso de ubicación.',
          2: 'La ubicación no está disponible en este momento.',
          3: 'La solicitud de ubicación ha tardado demasiado.'
        };
        reject(new Error(messages[error.code] || 'No se pudo obtener la ubicación.'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  });
}

async function fetchStations({ latitude, longitude, radius, apiKey }) {
  const params = new URLSearchParams({
    latitud: latitude.toFixed(6),
    longitud: longitude.toFixed(6),
    radio: String(radius),
    pagina: '1',
    limite: '200',
    fields: 'current'
  });

  const response = await fetch(`${API_BASE}/estaciones/radio?${params}`, {
    headers: { 'X-API-Key': apiKey }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // El mensaje genérico de estado HTTP es más útil que un error de JSON.
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error('La clave API no es válida o ha caducado.');
    if (response.status === 403) throw new Error('La clave no permite este dominio o el endpoint /estaciones/radio.');
    if (response.status === 429) throw new Error('Se ha alcanzado temporalmente el límite de consultas de la API.');
    throw new Error(payload?.message || payload?.error || `La API devolvió el error ${response.status}.`);
  }
  return extractStationArray(payload);
}

function readInputs() {
  return {
    consumption: Number(elements.consumption.value),
    amount: Number(elements.amount.value),
    radius: Number(elements.radius.value),
    fuelKey: elements.fuelType.value,
    tripMode: document.querySelector('input[name="tripMode"]:checked')?.value || 'roundtrip'
  };
}

function validateInputs(input) {
  if (!Number.isFinite(input.consumption) || input.consumption < 1 || input.consumption > 30) {
    return 'Indica un consumo medio entre 1 y 30 l/100 km.';
  }
  if (!Number.isFinite(input.amount) || input.amount < 5 || input.amount > 500) {
    return 'Indica un importe de repostaje entre 5 € y 500 €.';
  }
  if (!Number.isFinite(input.radius) || input.radius < 1 || input.radius > 50) {
    return 'Indica un radio de búsqueda entre 1 y 50 km.';
  }
  return '';
}

function renderResults(ranked) {
  const best = ranked[0];
  const nearest = [...ranked].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const saving = equivalentSaving(best, nearest);

  elements.bestName.textContent = best.name;
  elements.bestAddress.textContent = best.address;
  elements.bestPrice.textContent = `${decimals(best.price, 3)} €/l`;
  elements.bestDistance.textContent = `${decimals(best.roadDistanceKm, 1)} km`;
  elements.bestNetLiters.textContent = `${decimals(best.netLiters)} l`;
  elements.bestPurchased.textContent = `${decimals(best.purchasedLiters)} l`;
  elements.bestTripFuel.textContent = `${decimals(best.tripLiters)} l`;
  elements.bestEffectivePrice.textContent = `${decimals(best.effectivePrice, 3)} €/l`;
  elements.bestTripKm.textContent = `${decimals(best.tripKm, 1)} km`;
  elements.mapsLink.href = mapsUrl(best);

  if (nearest.id !== best.id && saving > 0.01) {
    elements.savingText.textContent = `Ahorro equivalente estimado de ${euro.format(saving)} frente a ir a la gasolinera más cercana.`;
  } else {
    elements.savingText.textContent = 'La mejor opción real también es la más cercana o la diferencia económica es mínima.';
  }

  const validDates = ranked.map(item => item.updatedAt).filter(Boolean).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()));
  if (validDates.length) {
    const latest = new Date(Math.max(...validDates.map(date => date.getTime())));
    elements.resultUpdated.textContent = `Actualizado ${latest.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`;
  } else {
    elements.resultUpdated.textContent = 'Precios actuales de la API';
  }

  elements.stationCount.textContent = `${ranked.length} con precio disponible`;
  elements.rankingList.replaceChildren();
  ranked.slice(0, 8).forEach((station, index) => {
    const node = elements.rankingTemplate.content.cloneNode(true);
    node.querySelector('.rank-number').textContent = String(index + 1);
    node.querySelector('.rank-name').textContent = station.name;
    node.querySelector('.rank-address').textContent = station.address;
    node.querySelector('.rank-distance').textContent = `${decimals(station.roadDistanceKm, 1)} km`;
    node.querySelector('.rank-net').textContent = `${decimals(station.netLiters)} l netos`;
    node.querySelector('.rank-price').textContent = `${decimals(station.price, 3)} €/l`;
    node.querySelector('.rank-route').href = mapsUrl(station);
    elements.rankingList.appendChild(node);
  });

  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function calculate(event) {
  event.preventDefault();
  clearError();
  const apiKey = getApiKey();
  if (!apiKey) {
    openSettings();
    return;
  }

  const input = readInputs();
  const validationError = validateInputs(input);
  if (validationError) {
    showError(validationError);
    return;
  }

  elements.calculateButton.disabled = true;
  elements.loading.hidden = false;
  elements.results.hidden = true;

  try {
    const position = state.position || await requestPosition();
    const stations = await fetchStations({ ...position, radius: input.radius, apiKey });
    if (!stations.length) throw new Error('No se han encontrado estaciones en ese radio. Prueba aumentando la distancia.');

    const ranked = rankStations(stations, input.fuelKey, position, input);
    if (!ranked.length) {
      throw new Error('Las estaciones encontradas no tienen un precio válido para el combustible seleccionado.');
    }
    state.ranked = ranked;
    renderResults(ranked);
  } catch (error) {
    showError(error instanceof Error ? error.message : 'No se pudo completar el cálculo.');
  } finally {
    elements.loading.hidden = true;
    elements.calculateButton.disabled = false;
  }
}

elements.openSettings.addEventListener('click', openSettings);
elements.saveApiKey.addEventListener('click', saveApiKey);
elements.clearApiKey.addEventListener('click', clearApiKey);
elements.locateButton.addEventListener('click', async () => {
  clearError();
  try { await requestPosition(); } catch (error) { showError(error.message); }
});
elements.form.addEventListener('submit', calculate);

setApiStatus();
if (!getApiKey()) setTimeout(openSettings, 350);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

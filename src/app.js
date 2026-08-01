import { FUEL_DEFINITIONS, extractStationArray, rankStations, equivalentSaving, mapsUrl, normalizeStationForList } from './core.js';

const API_BASE = 'https://api.precioil.es';
const API_KEY_STORAGE = 'combusplus.precioilApiKey';
const VEHICLES_STORAGE = 'combusplus.vehicles';
const SELECTED_VEHICLE_STORAGE = 'combusplus.selectedVehicleId';

const state = { position: null, ranked: [], browseStations: [], vehicles: [], selectedVehicleId: '' };
const $ = selector => document.querySelector(selector);
const elements = {
  tabs: [...document.querySelectorAll('.nav-button')],
  panels: [...document.querySelectorAll('.tab-panel')],
  actionTiles: [...document.querySelectorAll('[data-target-tab]')],
  openSettings: $('#openSettings'),
  openSettingsTile: $('#openSettingsTile'),
  settingsDialog: $('#settingsDialog'),
  apiStatus: $('#apiStatus'),
  apiKeyInput: $('#apiKeyInput'),
  settingsError: $('#settingsError'),
  saveApiKey: $('#saveApiKey'),
  clearApiKey: $('#clearApiKey'),
  heroLocation: $('#heroLocation'),
  dashboardFuelLabel: $('#dashboardFuelLabel'),
  dashboardFuelPrice: $('#dashboardFuelPrice'),
  dashboardBestStationLabel: $('#dashboardBestStationLabel'),
  dashboardBestStationPrice: $('#dashboardBestStationPrice'),
  dashSavingAmount: $('#dashSavingAmount'),
  dashSavingText: $('#dashSavingText'),
  homeActiveVehicle: $('#homeActiveVehicle'),
  homeVehicleCount: $('#homeVehicleCount'),
  homeLastRecommendation: $('#homeLastRecommendation'),

  form: $('#calculatorForm'),
  vehicleSelect: $('#vehicleSelect'),
  goVehicles: $('#goVehicles'),
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
  rankingTemplate: $('#rankingItemTemplate'),

  vehicleForm: $('#vehicleForm'),
  vehicleId: $('#vehicleId'),
  vehicleName: $('#vehicleName'),
  vehiclePlate: $('#vehiclePlate'),
  vehicleConsumption: $('#vehicleConsumption'),
  vehicleFuel: $('#vehicleFuel'),
  vehiclesError: $('#vehiclesError'),
  saveVehicleButton: $('#saveVehicleButton'),
  resetVehicleForm: $('#resetVehicleForm'),
  vehicleList: $('#vehicleList'),
  vehicleCardTemplate: $('#vehicleCardTemplate'),
  vehicleCountText: $('#vehicleCountText'),

  browseForm: $('#browseForm'),
  browseRadius: $('#browseRadius'),
  browseSort: $('#browseSort'),
  browseLocateButton: $('#browseLocateButton'),
  browseLocationTitle: $('#browseLocationTitle'),
  browseLocationText: $('#browseLocationText'),
  browseError: $('#browseError'),
  browseLoading: $('#browseLoadingSection'),
  browseSummaryTitle: $('#browseSummaryTitle'),
  browseSummaryText: $('#browseSummaryText'),
  stationBrowserList: $('#stationBrowserList'),
  stationBrowserItemTemplate: $('#stationBrowserItemTemplate')
};

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const decimals = (value, digits = 2) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

function getFuelLabel(key) { return FUEL_DEFINITIONS[key]?.label || key; }
function getApiKey() { return localStorage.getItem(API_KEY_STORAGE)?.trim() || ''; }
function saveVehiclesToStorage() { localStorage.setItem(VEHICLES_STORAGE, JSON.stringify(state.vehicles)); }
function showAlert(element, message) { element.textContent = message; element.hidden = false; }
function clearAlert(element) { element.hidden = true; element.textContent = ''; }

function setApiStatus() {
  const key = getApiKey();
  const configured = Boolean(key);
  if (!configured) elements.apiStatus.textContent = 'API sin configurar';
  else if (key.startsWith('sk_live_')) elements.apiStatus.textContent = 'API servidor';
  else elements.apiStatus.textContent = 'API navegador';
  elements.apiStatus.classList.toggle('ready', configured);
}

function setHomeDefaults() {
  elements.dashboardFuelLabel.textContent = getFuelLabel(elements.fuelType.value);
  elements.dashboardFuelPrice.textContent = '—';
  elements.dashboardBestStationLabel.textContent = 'Mejor opción';
  elements.dashboardBestStationPrice.textContent = '—';
  elements.dashSavingAmount.textContent = '0,00 €';
  elements.dashSavingText.textContent = 'Calcula tu mejor gasolinera para ver cuánto puedes ahorrar.';
  elements.homeLastRecommendation.textContent = 'Aún no calculada';
}

function updateHomeVehicleSummary() {
  const active = state.vehicles.find(item => item.id === state.selectedVehicleId);
  elements.homeActiveVehicle.textContent = active ? active.name : 'Sin seleccionar';
  elements.homeVehicleCount.textContent = String(state.vehicles.length);
}

function activateTab(tab) {
  elements.tabs.forEach(button => button.classList.toggle('is-active', button.dataset.tab === tab));
  elements.panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tab));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSettings() {
  elements.apiKeyInput.value = getApiKey();
  clearAlert(elements.settingsError);
  elements.settingsDialog.showModal();
}

function saveApiKey() {
  const key = elements.apiKeyInput.value.trim();
  if (!key) return showAlert(elements.settingsError, 'Introduce una clave API válida.');
  if (!key.startsWith('pk_live_') && !key.startsWith('sk_live_')) return showAlert(elements.settingsError, 'La clave debe comenzar por pk_live_ o sk_live_.');
  localStorage.setItem(API_KEY_STORAGE, key);
  setApiStatus();
  elements.settingsDialog.close();
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  elements.apiKeyInput.value = '';
  setApiStatus();
  showAlert(elements.settingsError, 'Clave eliminada de este dispositivo.');
}

function loadVehicles() {
  try { state.vehicles = JSON.parse(localStorage.getItem(VEHICLES_STORAGE) || '[]'); }
  catch { state.vehicles = []; }
  if (!Array.isArray(state.vehicles)) state.vehicles = [];
  state.selectedVehicleId = localStorage.getItem(SELECTED_VEHICLE_STORAGE) || '';
}

function generateId() { return `veh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function setSelectedVehicle(id) {
  state.selectedVehicleId = id || '';
  if (id) localStorage.setItem(SELECTED_VEHICLE_STORAGE, id); else localStorage.removeItem(SELECTED_VEHICLE_STORAGE);
  elements.vehicleSelect.value = id || '';
  const vehicle = state.vehicles.find(item => item.id === id);
  if (vehicle) {
    elements.consumption.value = String(vehicle.consumption);
    elements.fuelType.value = vehicle.fuelKey;
  }
  updateHomeVehicleSummary();
}

function renderVehicleSelect() {
  elements.vehicleSelect.innerHTML = '<option value="">Usar datos manuales</option>';
  state.vehicles.forEach(vehicle => {
    const option = document.createElement('option');
    option.value = vehicle.id;
    option.textContent = vehicle.plate ? `${vehicle.name} · ${vehicle.plate}` : vehicle.name;
    elements.vehicleSelect.appendChild(option);
  });
  if (state.vehicles.some(item => item.id === state.selectedVehicleId)) setSelectedVehicle(state.selectedVehicleId);
  else if (state.vehicles[0]) setSelectedVehicle(state.vehicles[0].id);
  else setSelectedVehicle('');
}

function renderVehicleCards() {
  elements.vehicleList.replaceChildren();
  elements.vehicleCountText.textContent = `${state.vehicles.length} ${state.vehicles.length === 1 ? 'vehículo' : 'vehículos'}`;
  updateHomeVehicleSummary();
  if (!state.vehicles.length) {
    const empty = document.createElement('article');
    empty.className = 'vehicle-card';
    empty.innerHTML = '<strong>No hay vehículos guardados</strong><span class="vehicle-card-meta">Añade tu primer vehículo para reutilizar su consumo y combustible.</span>';
    elements.vehicleList.appendChild(empty);
    return;
  }
  state.vehicles.forEach(vehicle => {
    const node = elements.vehicleCardTemplate.content.cloneNode(true);
    node.querySelector('.vehicle-card-name').textContent = vehicle.name;
    node.querySelector('.vehicle-card-meta').textContent = vehicle.plate || 'Sin matrícula o referencia';
    const stats = node.querySelector('.vehicle-card-stats');
    [ `${decimals(vehicle.consumption, 1)} l/100 km`, getFuelLabel(vehicle.fuelKey), vehicle.id === state.selectedVehicleId ? 'Vehículo activo' : null ].filter(Boolean).forEach(text => {
      const chip = document.createElement('span'); chip.className = 'vehicle-chip'; chip.textContent = text; stats.appendChild(chip);
    });
    node.querySelector('.select-vehicle').addEventListener('click', () => { setSelectedVehicle(vehicle.id); renderVehicleCards(); activateTab('home'); });
    node.querySelector('.edit-vehicle').addEventListener('click', () => {
      elements.vehicleId.value = vehicle.id; elements.vehicleName.value = vehicle.name; elements.vehiclePlate.value = vehicle.plate || '';
      elements.vehicleConsumption.value = String(vehicle.consumption); elements.vehicleFuel.value = vehicle.fuelKey; elements.saveVehicleButton.textContent = 'Actualizar vehículo';
    });
    node.querySelector('.delete-vehicle').addEventListener('click', () => {
      state.vehicles = state.vehicles.filter(item => item.id !== vehicle.id); saveVehiclesToStorage();
      if (state.selectedVehicleId === vehicle.id) setSelectedVehicle(state.vehicles[0]?.id || '');
      renderVehicleSelect(); renderVehicleCards(); resetVehicleForm();
    });
    elements.vehicleList.appendChild(node);
  });
}

function resetVehicleForm() {
  elements.vehicleId.value = ''; elements.vehicleName.value = ''; elements.vehiclePlate.value = '';
  elements.vehicleConsumption.value = '6.0'; elements.vehicleFuel.value = 'Gasolina95'; elements.saveVehicleButton.textContent = 'Guardar vehículo';
  clearAlert(elements.vehiclesError);
}

function saveVehicle(event) {
  event.preventDefault(); clearAlert(elements.vehiclesError);
  const payload = { id: elements.vehicleId.value || generateId(), name: elements.vehicleName.value.trim(), plate: elements.vehiclePlate.value.trim(), consumption: Number(elements.vehicleConsumption.value), fuelKey: elements.vehicleFuel.value };
  if (!payload.name) return showAlert(elements.vehiclesError, 'Indica un nombre para el vehículo.');
  if (!Number.isFinite(payload.consumption) || payload.consumption < 1 || payload.consumption > 30) return showAlert(elements.vehiclesError, 'Indica un consumo medio entre 1 y 30 l/100 km.');
  const index = state.vehicles.findIndex(item => item.id === payload.id);
  if (index >= 0) state.vehicles[index] = payload; else state.vehicles.unshift(payload);
  saveVehiclesToStorage(); setSelectedVehicle(payload.id); renderVehicleSelect(); renderVehicleCards(); resetVehicleForm();
}

function setLocationText(position) {
  const label = `Ubicación preparada · precisión ${Math.round(position.accuracy)} m`;
  elements.locationTitle.textContent = 'Ubicación preparada'; elements.locationText.textContent = label;
  elements.browseLocationTitle.textContent = 'Ubicación preparada'; elements.browseLocationText.textContent = label;
  elements.heroLocation.textContent = label;
}

async function requestPosition() {
  if (!('geolocation' in navigator)) throw new Error('Este navegador no permite obtener la ubicación.');
  elements.locationTitle.textContent = 'Obteniendo ubicación…'; elements.locationText.textContent = 'Acepta el permiso de ubicación del navegador.';
  elements.browseLocationTitle.textContent = 'Obteniendo ubicación…'; elements.browseLocationText.textContent = 'Acepta el permiso de ubicación del navegador.';
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(position => {
      state.position = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      setLocationText(state.position); resolve(state.position);
    }, error => {
      const messages = { 1: 'Has bloqueado el permiso de ubicación.', 2: 'La ubicación no está disponible en este momento.', 3: 'La solicitud de ubicación ha tardado demasiado.' };
      const message = messages[error.code] || 'No se pudo obtener la ubicación.';
      elements.heroLocation.textContent = message;
      reject(new Error(message));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 });
  });
}

async function fetchStations({ latitude, longitude, radius, apiKey }) {
  const params = new URLSearchParams({ latitud: latitude.toFixed(6), longitud: longitude.toFixed(6), radio: String(radius), pagina: '1', limite: '200', fields: 'current' });
  let response;
  try { response = await fetch(`${API_BASE}/estaciones/radio?${params}`, { headers: { 'X-API-Key': apiKey } }); }
  catch {
    const detail = apiKey.startsWith('sk_live_') ? ' La clave sk_live_ puede estar restringida a llamadas desde servidor o por dirección IP.' : '';
    throw new Error(`No se pudo conectar con Precioil desde este navegador.${detail}`);
  }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('La clave API no es válida o ha caducado.');
    if (response.status === 403) throw new Error(apiKey.startsWith('sk_live_') ? 'La API ha rechazado esta clave. Puede estar restringida por IP o a uso desde servidor.' : 'La API ha rechazado esta clave. Comprueba el dominio autorizado y el endpoint /estaciones/radio.');
    if (response.status === 429) throw new Error('Se ha alcanzado temporalmente el límite de consultas de la API.');
    throw new Error(payload?.message || payload?.error || `La API devolvió el error ${response.status}.`);
  }
  return extractStationArray(payload);
}

function readInputs() {
  return { consumption: Number(elements.consumption.value), amount: Number(elements.amount.value), radius: Number(elements.radius.value), fuelKey: elements.fuelType.value, tripMode: document.querySelector('input[name="tripMode"]:checked')?.value || 'roundtrip' };
}

function validateInputs(input) {
  if (!Number.isFinite(input.consumption) || input.consumption < 1 || input.consumption > 30) return 'Indica un consumo medio entre 1 y 30 l/100 km.';
  if (!Number.isFinite(input.amount) || input.amount < 5 || input.amount > 500) return 'Indica un importe de repostaje entre 5 € y 500 €.';
  if (!Number.isFinite(input.radius) || input.radius < 1 || input.radius > 50) return 'Indica un radio de búsqueda entre 1 y 50 km.';
  return '';
}

function renderResults(ranked, fuelKey) {
  const best = ranked[0];
  const nearest = [...ranked].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const saving = equivalentSaving(best, nearest);
  elements.bestName.textContent = best.name; elements.bestAddress.textContent = best.address; elements.bestPrice.textContent = `${decimals(best.price, 3)} €/l`;
  elements.bestDistance.textContent = `${decimals(best.roadDistanceKm, 1)} km`; elements.bestNetLiters.textContent = `${decimals(best.netLiters)} l`; elements.bestPurchased.textContent = `${decimals(best.purchasedLiters)} l`;
  elements.bestTripFuel.textContent = `${decimals(best.tripLiters)} l`; elements.bestEffectivePrice.textContent = `${decimals(best.effectivePrice, 3)} €/l`; elements.bestTripKm.textContent = `${decimals(best.tripKm, 1)} km`;
  elements.mapsLink.href = mapsUrl(best);
  elements.savingText.textContent = nearest.id !== best.id && saving > 0.01 ? `Ahorro equivalente estimado de ${euro.format(saving)} frente a la gasolinera más cercana.` : 'La mejor opción real también es la más cercana o la diferencia es mínima.';
  const validDates = ranked.map(item => item.updatedAt).filter(Boolean).map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime()));
  elements.resultUpdated.textContent = validDates.length ? `Actualizado ${new Date(Math.max(...validDates.map(d => d.getTime()))).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : 'Precios actuales';
  elements.stationCount.textContent = `${ranked.length} opciones`;
  elements.rankingList.replaceChildren();
  ranked.slice(0, 8).forEach((station, index) => {
    const node = elements.rankingTemplate.content.cloneNode(true);
    node.querySelector('.list-rank').textContent = String(index + 1); node.querySelector('.rank-name').textContent = station.name; node.querySelector('.rank-address').textContent = station.address;
    node.querySelector('.rank-distance').textContent = `${decimals(station.roadDistanceKm, 1)} km`; node.querySelector('.rank-net').textContent = `${decimals(station.netLiters)} l netos`; node.querySelector('.list-price').textContent = `${decimals(station.price, 3)} €/l`;
    node.querySelector('.row-link').href = mapsUrl(station); elements.rankingList.appendChild(node);
  });
  elements.results.hidden = false;

  elements.dashboardFuelLabel.textContent = getFuelLabel(fuelKey);
  elements.dashboardFuelPrice.textContent = `${decimals(best.price, 3)} €/l`;
  elements.dashboardBestStationLabel.textContent = best.name.length > 18 ? `${best.name.slice(0, 18)}…` : best.name;
  elements.dashboardBestStationPrice.textContent = `${decimals(best.netLiters, 1)} l netos`;
  elements.dashSavingAmount.textContent = euro.format(saving);
  elements.dashSavingText.textContent = nearest.id !== best.id ? `Ahorro estimado frente a la gasolinera más cercana.` : 'La opción más cercana ya es la más conveniente.';
  elements.homeLastRecommendation.textContent = best.name;
}

async function calculate(event) {
  event.preventDefault(); clearAlert(elements.formError);
  const apiKey = getApiKey(); if (!apiKey) return openSettings();
  const input = readInputs(); const validationError = validateInputs(input); if (validationError) return showAlert(elements.formError, validationError);
  elements.calculateButton.disabled = true; elements.loading.hidden = false; elements.results.hidden = true;
  try {
    const position = state.position || await requestPosition();
    const stations = await fetchStations({ ...position, radius: input.radius, apiKey });
    if (!stations.length) throw new Error('No se han encontrado estaciones en ese radio.');
    const ranked = rankStations(stations, input.fuelKey, position, input);
    if (!ranked.length) throw new Error('Las estaciones encontradas no tienen un precio válido para el combustible seleccionado.');
    state.ranked = ranked; renderResults(ranked, input.fuelKey);
  } catch (error) { showAlert(elements.formError, error instanceof Error ? error.message : 'No se pudo completar el cálculo.'); }
  finally { elements.loading.hidden = true; elements.calculateButton.disabled = false; }
}

function sortBrowserStations(items, criterion) {
  const copy = [...items];
  if (criterion === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else copy.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'es'));
  return copy;
}

function renderBrowserStations(items) {
  elements.stationBrowserList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('article'); empty.className = 'station-card'; empty.innerHTML = '<strong>No hay gasolineras para mostrar</strong><span class="station-address">Prueba ampliando el rango o actualizando la ubicación.</span>'; elements.stationBrowserList.appendChild(empty); return;
  }
  items.forEach(station => {
    const node = elements.stationBrowserItemTemplate.content.cloneNode(true);
    node.querySelector('.station-name').textContent = station.name; node.querySelector('.station-address').textContent = station.address; node.querySelector('.station-distance').textContent = `${decimals(station.distanceKm, 1)} km`;
    node.querySelector('.route-button').href = mapsUrl(station); const list = node.querySelector('.fuel-chip-list');
    (station.fuels.length ? station.fuels : [{ label: 'Sin precios disponibles', price: null }]).forEach(fuel => {
      const chip = document.createElement('span'); chip.className = 'fuel-chip'; chip.textContent = fuel.price ? `${fuel.label} · ${decimals(fuel.price, 3)} €/l` : fuel.label; list.appendChild(chip);
    });
    elements.stationBrowserList.appendChild(node);
  });
}

async function browseStations(event) {
  event.preventDefault(); clearAlert(elements.browseError);
  const apiKey = getApiKey(); if (!apiKey) return openSettings();
  const radius = Number(elements.browseRadius.value); if (!Number.isFinite(radius) || radius < 1 || radius > 50) return showAlert(elements.browseError, 'Indica un rango de búsqueda entre 1 y 50 km.');
  elements.browseLoading.hidden = false;
  try {
    const position = state.position || await requestPosition();
    const rawStations = await fetchStations({ ...position, radius, apiKey }); if (!rawStations.length) throw new Error('No se han encontrado estaciones en ese radio.');
    state.browseStations = rawStations.map(raw => normalizeStationForList(raw, position)).filter(Boolean);
    const sorted = sortBrowserStations(state.browseStations, elements.browseSort.value);
    elements.browseSummaryTitle.textContent = 'Gasolineras cercanas'; elements.browseSummaryText.textContent = `${sorted.length} gasolineras encontradas en un radio de ${radius} km.`;
    renderBrowserStations(sorted);
  } catch (error) { showAlert(elements.browseError, error instanceof Error ? error.message : 'No se pudieron cargar las estaciones.'); }
  finally { elements.browseLoading.hidden = true; }
}

function boot() {
  loadVehicles(); renderVehicleSelect(); renderVehicleCards(); resetVehicleForm(); setApiStatus(); setHomeDefaults(); activateTab('home');
  if (!getApiKey()) setTimeout(openSettings, 350);
}

elements.tabs.forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
elements.actionTiles.forEach(button => button.addEventListener('click', () => activateTab(button.dataset.targetTab)));
elements.openSettings.addEventListener('click', openSettings); elements.openSettingsTile.addEventListener('click', openSettings);
elements.saveApiKey.addEventListener('click', saveApiKey); elements.clearApiKey.addEventListener('click', clearApiKey);
elements.locateButton.addEventListener('click', async () => { clearAlert(elements.formError); try { await requestPosition(); } catch (error) { showAlert(elements.formError, error.message); } });
elements.browseLocateButton.addEventListener('click', async () => { clearAlert(elements.browseError); try { await requestPosition(); } catch (error) { showAlert(elements.browseError, error.message); } });
elements.form.addEventListener('submit', calculate); elements.vehicleForm.addEventListener('submit', saveVehicle); elements.resetVehicleForm.addEventListener('click', resetVehicleForm);
elements.vehicleSelect.addEventListener('change', () => setSelectedVehicle(elements.vehicleSelect.value));
elements.goVehicles.addEventListener('click', () => activateTab('vehicles'));
elements.browseForm.addEventListener('submit', browseStations); elements.browseSort.addEventListener('change', () => renderBrowserStations(sortBrowserStations(state.browseStations, elements.browseSort.value)));

boot();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

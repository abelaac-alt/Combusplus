import {
  FUEL_DEFINITIONS,
  extractStationArray,
  normalizeStationForList,
  personalPrice,
  discountForStation,
  scoreNormalizedStation,
  rankNormalizedStations,
  rankFullTankStations,
  equivalentSaving,
  mapsUrl,
  averagePrice,
  priceRange
} from './core.js';

const RUNTIME_CONFIG = window.COMBUSPLUS_CONFIG || {};

const STORAGE = {
  settings: 'combusplus.v5.settings',
  vehicles: 'combusplus.v5.vehicles',
  selectedVehicle: 'combusplus.v5.selectedVehicle',
  favorites: 'combusplus.v5.favorites',
  discounts: 'combusplus.v5.discounts',
  history: 'combusplus.v5.history',
  snapshots: 'combusplus.v5.snapshots',
  filters: 'combusplus.v5.filters',
  installationId: 'combusplus.v8.installationId',
  sessionToken: 'combusplus.v8.sessionToken',
  sessionExpiresAt: 'combusplus.v8.sessionExpiresAt'
};

const DEFAULT_SETTINGS = {
  supabaseFunctionsUrl: String(RUNTIME_CONFIG.supabaseFunctionsUrl || ''),
  supabasePublishableKey: String(RUNTIME_CONFIG.supabasePublishableKey || ''),
  googleMapsKey: String(RUNTIME_CONFIG.googleMapsKey || ''),
  googleMapId: String(RUNTIME_CONFIG.googleMapId || ''),
  notificationsEnabled: false,
  notificationInterval: 6,
  notificationThreshold: 0.001,
  notificationDirection: 'both'
};

const DEFAULT_FILTERS = {
  fuelKey: 'Diesel',
  radius: 15,
  sort: 'effective',
  openFilter: 'all',
  mapMode: 'all',
  priceDisplay: 'liter',
  amount: 50,
  consumption: 6.5,
  tripMode: 'roundtrip'
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  filters: { ...DEFAULT_FILTERS },
  vehicles: [],
  selectedVehicleId: '',
  favorites: [],
  discounts: [],
  history: [],
  snapshots: {},
  position: null,
  stations: [],
  currentStation: null,
  currentSimulation: null,
  map: null,
  markers: [],
  mapsPromise: null,
  backendSession: {
    token: '',
    expiresAt: 0,
    promise: null
  }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const el = {
  pages: $$('.page'),
  nav: $$('[data-nav]'),
  openSettings: $('#openSettings'),

  quickSearchForm: $('#quickSearchForm'),
  quickVehicle: $('#quickVehicle'),
  quickConsumption: $('#quickConsumption'),
  quickTankCapacity: $('#quickTankCapacity'),
  quickFuel: $('#quickFuel'),
  quickAmount: $('#quickAmount'),
  quickAmountField: $('#quickAmountField'),
  quickTankSummary: $('#quickTankSummary'),
  quickTankSummaryValue: $('#quickTankSummaryValue'),
  quickRadius: $('#quickRadius'),
  manualVehicleFields: $('#manualVehicleFields'),
  quickSearchError: $('#quickSearchError'),
  quickSearchButton: $('#quickSearchButton'),
  refreshLocation: $('#refreshLocation'),
  refreshFavoriteWidget: $('#refreshFavoriteWidget'),
  favoriteWidgetList: $('#favoriteWidgetList'),
  fullTankButton: $('#fullTankButton'),
  fullTankHint: $('#fullTankHint'),
  locationStatus: $('#locationStatus'),

  bestResult: $('#bestResult'),
  bestName: $('#bestName'),
  bestAddress: $('#bestAddress'),
  bestPrice: $('#bestPrice'),
  bestDistance: $('#bestDistance'),
  bestNetLiters: $('#bestNetLiters'),
  bestRefuelCost: $('#bestRefuelCost'),

  comparisonDialog: $('#comparisonDialog'),
  compareBestName: $('#compareBestName'),
  compareBestPrice: $('#compareBestPrice'),
  compareBestTrip: $('#compareBestTrip'),
  compareBestTripFuel: $('#compareBestTripFuel'),
  compareBestCost: $('#compareBestCost'),
  compareSelectedName: $('#compareSelectedName'),
  compareSelectedPrice: $('#compareSelectedPrice'),
  compareSelectedTrip: $('#compareSelectedTrip'),
  compareSelectedTripFuel: $('#compareSelectedTripFuel'),
  compareSelectedCost: $('#compareSelectedCost'),
  compareSaving: $('#compareSaving'),
  compareSavingCopy: $('#compareSavingCopy'),
  compareBestRoute: $('#compareBestRoute'),
  bestSaving: $('#bestSaving'),
  bestSavingCopy: $('#bestSavingCopy'),
  bestRoute: $('#bestRoute'),
  bestDetails: $('#bestDetails'),
  bestFavorite: $('#bestFavorite'),
  markRefueled: $('#markRefueled'),

  openFilters: $('#openFilters'),
  listFuel: $('#listFuel'),
  listRadius: $('#listRadius'),
  listSort: $('#listSort'),
  searchStations: $('#searchStations'),
  listSummary: $('#listSummary'),
  stationList: $('#stationList'),

  refreshMap: $('#refreshMap'),
  mapModeLabel: $('#mapModeLabel'),
  mapTopTenToggle: $('#mapTopTenToggle'),
  googleMap: $('#googleMap'),
  configureMap: $('#configureMap'),
  mapPreviewList: $('#mapPreviewList'),

  favoriteCount: $('#favoriteCount'),
  favoriteNavBadge: $('#favoriteNavBadge'),
  globalNotificationsToggle: $('#globalNotificationsToggle'),
  favoriteList: $('#favoriteList'),

  statSaving: $('#statSaving'),
  statRefuels: $('#statRefuels'),
  statAmount: $('#statAmount'),
  statLiters: $('#statLiters'),
  exportData: $('#exportData'),
  clearHistory: $('#clearHistory'),
  refuelHistory: $('#refuelHistory'),
  newVehicle: $('#newVehicle'),
  vehicleList: $('#vehicleList'),
  newDiscount: $('#newDiscount'),
  discountList: $('#discountList'),

  stationDialog: $('#stationDialog'),
  detailBrand: $('#detailBrand'),
  detailName: $('#detailName'),
  detailAddress: $('#detailAddress'),
  detailFuelTable: $('#detailFuelTable'),
  detailOpen: $('#detailOpen'),
  detailHours: $('#detailHours'),
  detailDistance: $('#detailDistance'),
  detailSelectedPrice: $('#detailSelectedPrice'),
  detailAverageText: $('#detailAverageText'),
  detailScaleMarker: $('#detailScaleMarker'),
  detailScaleMin: $('#detailScaleMin'),
  detailScaleMax: $('#detailScaleMax'),
  priceHistoryChart: $('#priceHistoryChart'),
  detailTrend: $('#detailTrend'),
  detailAlert: $('#detailAlert'),
  detailFavorite: $('#detailFavorite'),
  detailRoute: $('#detailRoute'),
  detailSimulate: $('#detailSimulate'),

  filtersDialog: $('#filtersDialog'),
  filtersForm: $('#filtersForm'),
  vehicleDialog: $('#vehicleDialog'),
  vehicleForm: $('#vehicleForm'),
  vehicleDialogTitle: $('#vehicleDialogTitle'),
  vehicleId: $('#vehicleId'),
  vehicleName: $('#vehicleName'),
  vehiclePlate: $('#vehiclePlate'),
  vehicleTank: $('#vehicleTank'),
  vehicleConsumption: $('#vehicleConsumption'),
  vehicleFuel: $('#vehicleFuel'),
  vehicleError: $('#vehicleError'),
  discountDialog: $('#discountDialog'),
  discountForm: $('#discountForm'),
  discountDialogTitle: $('#discountDialogTitle'),
  discountId: $('#discountId'),
  discountName: $('#discountName'),
  discountStation: $('#discountStation'),
  discountFuel: $('#discountFuel'),
  discountType: $('#discountType'),
  discountValue: $('#discountValue'),
  discountError: $('#discountError'),
  settingsDialog: $('#settingsDialog'),
  settingsForm: $('#settingsForm'),
  notificationsEnabled: $('#notificationsEnabled'),
  notificationInterval: $('#notificationInterval'),
  notificationThreshold: $('#notificationThreshold'),
  notificationDirection: $('#notificationDirection'),
  requestNotifications: $('#requestNotifications'),
  settingsError: $('#settingsError'),

  stationCardTemplate: $('#stationCardTemplate'),
  favoriteCardTemplate: $('#favoriteCardTemplate')
};

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = (value, digits = 3) => new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
}).format(value);
const nowIso = () => new Date().toISOString();

function readStoredValue(key) {
  let value = null;
  try { value = localStorage.getItem(key); } catch { /* almacenamiento web bloqueado */ }
  if (value == null && window.AndroidBridge?.getLocalValue) {
    try {
      const nativeValue = window.AndroidBridge.getLocalValue(key);
      if (nativeValue != null && nativeValue !== '') {
        value = nativeValue;
        try { localStorage.setItem(key, value); } catch { /* sin almacenamiento web */ }
      }
    } catch { /* puente nativo no disponible */ }
  }
  return value;
}
function writeStoredValue(key, value) {
  const text = String(value);
  try { localStorage.setItem(key, text); } catch { /* sin almacenamiento web */ }
  if (window.AndroidBridge?.saveLocalValue) {
    try { window.AndroidBridge.saveLocalValue(key, text); } catch { /* puente nativo no disponible */ }
  }
}
function removeStoredValue(key) {
  try { localStorage.removeItem(key); } catch { /* sin almacenamiento web */ }
  if (window.AndroidBridge?.removeLocalValue) {
    try { window.AndroidBridge.removeLocalValue(key); } catch { /* puente nativo no disponible */ }
  }
}
function readJSON(key, fallback) {
  try {
    const value = JSON.parse(readStoredValue(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) { writeStoredValue(key, JSON.stringify(value)); }
function uid(prefix = 'id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}
function toast(message) {
  $('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}
function showError(node, message) { node.textContent = message; node.hidden = false; }
function clearError(node) { node.hidden = true; node.textContent = ''; }
function fuelLabel(key) { return FUEL_DEFINITIONS[key]?.label || key; }
function activeVehicle() { return state.vehicles.find(vehicle => vehicle.id === state.selectedVehicleId) || null; }
function favoriteById(id) { return state.favorites.find(favorite => String(favorite.id) === String(id)); }
function isFavorite(id) { return Boolean(favoriteById(id)); }
function isNative() {
  try { return Boolean(window.AndroidBridge?.isNativeApp?.()); }
  catch { return false; }
}

function loadState() {
  const savedSettings = readJSON(STORAGE.settings, {});
  state.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  // La infraestructura se configura durante el despliegue y no se solicita al usuario.
  // Los valores de runtime siempre prevalecen sobre configuraciones antiguas en caché.
  state.settings.supabaseFunctionsUrl = String(RUNTIME_CONFIG.supabaseFunctionsUrl || state.settings.supabaseFunctionsUrl || '').replace(/\/$/, '');
  state.settings.supabasePublishableKey = String(RUNTIME_CONFIG.supabasePublishableKey || state.settings.supabasePublishableKey || '');
  state.settings.googleMapsKey = String(RUNTIME_CONFIG.googleMapsKey || state.settings.googleMapsKey || '');
  state.settings.googleMapId = String(RUNTIME_CONFIG.googleMapId || state.settings.googleMapId || '');
  state.filters = { ...DEFAULT_FILTERS, ...readJSON(STORAGE.filters, {}) };
  state.vehicles = readJSON(STORAGE.vehicles, []);
  state.selectedVehicleId = readStoredValue(STORAGE.selectedVehicle) || '';
  state.favorites = readJSON(STORAGE.favorites, []);
  state.discounts = readJSON(STORAGE.discounts, []);
  state.history = readJSON(STORAGE.history, []);
  state.snapshots = readJSON(STORAGE.snapshots, {});
  if (!state.vehicles.some(vehicle => vehicle.id === state.selectedVehicleId)) {
    state.selectedVehicleId = state.vehicles[0]?.id || '';
  }
}
function saveSettings() { writeJSON(STORAGE.settings, state.settings); syncNativeConfig(); }
function saveFavorites() { writeJSON(STORAGE.favorites, state.favorites); renderFavorites(); renderHomeWidgets(); renderStations(); renderMapPreview(); syncNativeConfig(); }
function saveSnapshots() { writeJSON(STORAGE.snapshots, state.snapshots); renderHomeWidgets(); syncNativeConfig(); }
function saveVehicles() {
  writeJSON(STORAGE.vehicles, state.vehicles);
  if (state.selectedVehicleId) writeStoredValue(STORAGE.selectedVehicle, state.selectedVehicleId);
  else removeStoredValue(STORAGE.selectedVehicle);
  renderVehicleSelector();
  renderVehicles();
  renderHomeWidgets();
  syncNativeConfig();
}
function saveDiscounts() { writeJSON(STORAGE.discounts, state.discounts); renderDiscounts(); renderStations(); }
function saveHistory() { writeJSON(STORAGE.history, state.history); renderStats(); }
function saveFilters() { writeJSON(STORAGE.filters, state.filters); }

function fillFuelSelect(select, includeAll = false) {
  select.innerHTML = includeAll ? '<option value="all">Todos los combustibles</option>' : '';
  for (const [key, definition] of Object.entries(FUEL_DEFINITIONS)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = definition.label;
    select.appendChild(option);
  }
}

function renderVehicleSelector() {
  el.quickVehicle.innerHTML = '<option value="">Datos manuales</option>';
  for (const vehicle of state.vehicles) {
    const option = document.createElement('option');
    option.value = vehicle.id;
    option.textContent = vehicle.plate ? `${vehicle.name} · ${vehicle.plate}` : vehicle.name;
    el.quickVehicle.appendChild(option);
  }
  el.quickVehicle.value = state.selectedVehicleId || '';
  applyVehicleToSearch();
}

function applyVehicleToSearch() {
  const vehicle = state.vehicles.find(item => item.id === el.quickVehicle.value) || null;
  el.manualVehicleFields.hidden = Boolean(vehicle);
  if (vehicle) {
    state.selectedVehicleId = vehicle.id;
    writeStoredValue(STORAGE.selectedVehicle, vehicle.id);
    el.quickConsumption.value = vehicle.consumption;
    el.quickTankCapacity.value = vehicle.tank || 50;
    el.quickFuel.value = vehicle.fuelKey;
    el.listFuel.value = vehicle.fuelKey;
    state.filters.fuelKey = vehicle.fuelKey;
    state.filters.consumption = vehicle.consumption;
  } else {
    state.selectedVehicleId = '';
    removeStoredValue(STORAGE.selectedVehicle);
  }
  saveFilters();
  updateSearchModeUi();
  syncNativeConfig();
}

function selectedSearchMode() {
  return $('input[name="searchMode"]:checked')?.value || 'amount';
}

function updateSearchModeUi() {
  const fullTank = selectedSearchMode() === 'fullTank';
  const vehicle = state.vehicles.find(item => item.id === el.quickVehicle.value) || null;
  const capacity = Number(vehicle?.tank ?? el.quickTankCapacity?.value ?? 50);
  if (el.quickAmountField) el.quickAmountField.hidden = fullTank;
  if (el.quickTankSummary) el.quickTankSummary.hidden = !fullTank;
  if (el.quickTankSummaryValue) el.quickTankSummaryValue.textContent = `${Number.isFinite(capacity) ? num(capacity, 0) : '—'} litros`;
  if (el.quickSearchButton) {
    const label = el.quickSearchButton.querySelector('span');
    if (label) label.textContent = fullTank ? 'Encontrar dónde llenar el depósito' : 'Encontrar la gasolinera más barata';
  }
}

function currentSearchInput() {
  const vehicle = state.vehicles.find(item => item.id === el.quickVehicle.value) || null;
  const selectedTrip = $('input[name="quickTrip"]:checked')?.value || 'roundtrip';
  const fullTank = selectedSearchMode() === 'fullTank';
  return {
    vehicle,
    vehicleId: vehicle?.id || '',
    fuelKey: vehicle?.fuelKey || el.quickFuel.value,
    consumption: Number(vehicle?.consumption ?? el.quickConsumption.value),
    tankCapacity: Number(vehicle?.tank ?? el.quickTankCapacity?.value),
    amount: Number(el.quickAmount.value),
    radius: Number(el.quickRadius.value),
    tripMode: selectedTrip,
    discounts: state.discounts,
    fullTank
  };
}

function syncSearchControls(input) {
  state.filters.fuelKey = input.fuelKey;
  state.filters.consumption = input.consumption;
  state.filters.amount = input.amount;
  state.filters.radius = input.radius;
  state.filters.tripMode = input.tripMode;
  el.listFuel.value = input.fuelKey;
  el.listRadius.value = String(input.radius);
  saveFilters();
}

function navigate(page) {
  if (!['list', 'map', 'favorites', 'stats'].includes(page)) page = 'list';
  if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
  el.pages.forEach(panel => panel.classList.toggle('is-active', panel.dataset.page === page));
  $$('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.nav === page));
  if (page === 'map') renderMap();
  if (page === 'favorites') renderFavorites();
  if (page === 'stats') renderStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openDialog(dialog) {
  if (!dialog?.open) {
    dialog?.showModal();
    document.documentElement.classList.add('dialog-open');
  }
}
function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
  if (!$$('dialog[open]').length) document.documentElement.classList.remove('dialog-open');
}

function apiEndpoint(path, params = '') {
  const base = String(state.settings.supabaseFunctionsUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('El servidor de Combusplus no está configurado.');
  const functionName = path.includes('estaciones') || path.includes('stations-nearby')
    ? 'stations-nearby'
    : path.replace(/^\//, '');
  const query = String(params || '');
  return `${base}/${functionName}${query ? `?${query}` : ''}`;
}

function randomInstallationId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function installationId() {
  let value = readStoredValue(STORAGE.installationId) || '';
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(value)) {
    value = randomInstallationId();
    writeStoredValue(STORAGE.installationId, value);
  }
  return value;
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const nativeIntegrityCallbacks = new Map();
window.CombusplusNative = window.CombusplusNative || {};
window.CombusplusNative.resolveIntegrity = (requestId, token, error) => {
  const callback = nativeIntegrityCallbacks.get(String(requestId));
  if (!callback) return;
  nativeIntegrityCallbacks.delete(String(requestId));
  if (error) callback.reject(new Error(String(error)));
  else callback.resolve(String(token || ''));
};

function requestNativeIntegrityToken(requestHash) {
  if (!isNative() || !window.AndroidBridge?.requestIntegrityToken) return Promise.resolve('');
  const requestId = uid('integrity');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      nativeIntegrityCallbacks.delete(requestId);
      resolve('');
    }, 20_000);
    nativeIntegrityCallbacks.set(requestId, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); }
    });
    try { window.AndroidBridge.requestIntegrityToken(requestId, requestHash); }
    catch (error) {
      clearTimeout(timeout);
      nativeIntegrityCallbacks.delete(requestId);
      resolve('');
    }
  });
}

function clearBackendSession() {
  state.backendSession.token = '';
  state.backendSession.expiresAt = 0;
  removeStoredValue(STORAGE.sessionToken);
  removeStoredValue(STORAGE.sessionExpiresAt);
}

async function ensureBackendSession(force = false) {
  const now = Date.now();
  const storedToken = readStoredValue(STORAGE.sessionToken) || '';
  const storedExpiry = Number(readStoredValue(STORAGE.sessionExpiresAt) || 0);
  if (!force && storedToken && storedExpiry > now + 5 * 60_000) {
    state.backendSession.token = storedToken;
    state.backendSession.expiresAt = storedExpiry;
    return storedToken;
  }
  if (!force && state.backendSession.promise) return state.backendSession.promise;

  state.backendSession.promise = (async () => {
    const id = installationId();
    const platform = isNative() ? 'android' : 'web';
    const requestHash = await sha256Base64Url(`${id}|${platform}|${Math.floor(Date.now() / 300000)}`);
    let integrityToken = '';
    try { integrityToken = await requestNativeIntegrityToken(requestHash); }
    catch { integrityToken = ''; }

    const url = apiEndpoint('bootstrap');
    const publishable = String(state.settings.supabasePublishableKey || '').trim();
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(publishable ? { apikey: publishable } : {})
        },
        body: JSON.stringify({
          installationId: id,
          platform,
          appVersion: String(RUNTIME_CONFIG.version || '8.0.0'),
          requestHash,
          integrityToken: integrityToken || undefined
        })
      });
    } catch {
      throw new Error('No se pudo iniciar una sesión segura con Combusplus.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.sessionToken) {
      throw new Error(payload?.error || 'El servidor no pudo autorizar esta instalación.');
    }
    const expiresAt = Date.parse(payload.expiresAt || '') || Date.now() + 24 * 60 * 60_000;
    state.backendSession.token = payload.sessionToken;
    state.backendSession.expiresAt = expiresAt;
    writeStoredValue(STORAGE.sessionToken, payload.sessionToken);
    writeStoredValue(STORAGE.sessionExpiresAt, String(expiresAt));
    return payload.sessionToken;
  })();

  try { return await state.backendSession.promise; }
  finally { state.backendSession.promise = null; }
}

async function apiHeaders() {
  const sessionToken = await ensureBackendSession();
  const headers = {
    Accept: 'application/json',
    'X-Combusplus-Session': sessionToken,
    'X-Installation-Id': installationId()
  };
  const publishable = String(state.settings.supabasePublishableKey || '').trim();
  if (publishable) headers.apikey = publishable;
  return headers;
}

async function apiFetch(path, params = '', options = {}, retry = true) {
  const url = apiEndpoint(path, params);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = await apiHeaders();
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      cache: 'no-store',
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {})
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor seguro de precios.');
  }
  let payload = null;
  try { payload = await response.json(); } catch { /* sin cuerpo JSON */ }
  if (response.status === 401 && retry) {
    clearBackendSession();
    await ensureBackendSession(true);
    return apiFetch(path, params, options, false);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(payload?.error || 'El servidor ha rechazado la solicitud.');
    throw new Error(payload?.message || payload?.error || `Error ${response.status} al consultar precios.`);
  }
  return payload;
}

async function requestPosition(force = false) {
  if (!navigator.geolocation) throw new Error('Este dispositivo no permite obtener la ubicación.');
  if (state.position && !force) return state.position;
  el.locationStatus.textContent = 'Obteniendo ubicación…';
  const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    resolve,
    error => {
      const messages = {
        1: 'Permiso de ubicación bloqueado.',
        2: 'Ubicación no disponible.',
        3: 'La ubicación ha tardado demasiado.'
      };
      reject(new Error(messages[error.code] || 'No se pudo obtener la ubicación.'));
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: force ? 0 : 120000 }
  ));
  state.position = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy
  };
  try { window.AndroidBridge?.saveLastLocation?.(state.position.latitude, state.position.longitude); } catch { /* no nativo */ }
  el.locationStatus.textContent = `Ubicación activa · precisión ${Math.round(position.coords.accuracy)} m`;
  return state.position;
}

async function fetchStations(radius = state.filters.radius) {
  const position = await requestPosition();
  const params = new URLSearchParams({
    latitud: position.latitude.toFixed(6),
    longitud: position.longitude.toFixed(6),
    radio: String(radius),
    pagina: '1',
    limite: '250',
    fields: 'current'
  });
  const payload = await apiFetch('/estaciones/radio', params);
  state.stations = extractStationArray(payload)
    .map(raw => normalizeStationForList(raw, position))
    .filter(Boolean);
  recordSnapshots(state.stations);
  return state.stations;
}

function stationPrice(station, fuelKey = state.filters.fuelKey) {
  return personalPrice(station, fuelKey, state.discounts);
}
function stationBasePrice(station, fuelKey = state.filters.fuelKey) {
  return station.fuels?.find(fuel => fuel.key === fuelKey)?.price || null;
}
function displayPrice(station, fuelKey = state.filters.fuelKey) {
  const price = stationPrice(station, fuelKey);
  if (!price) return 'Sin precio';
  if (state.filters.priceDisplay === 'tank') {
    const tank = activeVehicle()?.tank || 50;
    return euro.format(price * tank);
  }
  return `${num(price)} €/l`;
}

function rankingInput() {
  const source = state.currentSimulation?.input || {
    fuelKey: state.filters.fuelKey,
    consumption: Number(state.filters.consumption) || 6.5,
    amount: Number(state.filters.amount) || 50,
    tripMode: state.filters.tripMode || 'roundtrip',
    discounts: state.discounts
  };
  return { ...source, discounts: state.discounts };
}

function rankStations(stations, input) {
  return input?.fullTank ? rankFullTankStations(stations, input) : rankNormalizedStations(stations, input);
}

function filteredStations() {
  let items = state.stations.filter(station => stationPrice(station));
  if (state.filters.openFilter === 'open') items = items.filter(station => station.isOpen === true);

  if (state.filters.sort === 'effective') {
    return rankStations(items, rankingInput());
  }
  const fuelKey = state.filters.fuelKey;
  items.sort((a, b) => {
    if (state.filters.sort === 'distance') return a.distanceKm - b.distanceKm;
    if (state.filters.sort === 'name') return a.name.localeCompare(b.name, 'es');
    return (stationBasePrice(a, fuelKey) || 99) - (stationBasePrice(b, fuelKey) || 99);
  });
  return items;
}

function validateSearch(input) {
  if (!Number.isFinite(input.consumption) || input.consumption < 1 || input.consumption > 30) return 'Indica un consumo entre 1 y 30 l/100 km.';
  if (input.fullTank) {
    if (!Number.isFinite(input.tankCapacity) || input.tankCapacity < 10 || input.tankCapacity > 200) return 'Indica una capacidad de depósito entre 10 y 200 litros.';
  } else if (!Number.isFinite(input.amount) || input.amount < 5 || input.amount > 500) {
    return 'Indica un importe entre 5 € y 500 €.';
  }
  if (!Number.isFinite(input.radius) || input.radius < 1 || input.radius > 50) return 'Indica un radio entre 1 y 50 km.';
  return '';
}

function recommendationRequest(input, selectedStationId = '') {
  if (!state.position) throw new Error('La ubicación todavía no está disponible.');
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
    selectedStationId: selectedStationId || undefined
  };
}

async function fetchRecommendation(input) {
  await requestPosition();
  const payload = await apiFetch('recommend', '', {
    method: 'POST',
    body: recommendationRequest(input)
  });
  state.stations = Array.isArray(payload.items) ? payload.items : [];
  recordSnapshots(state.stations);
  if (!payload.best) throw new Error('No hay gasolineras compatibles dentro del radio seleccionado.');
  return payload;
}

async function executeSearch(event) {
  event?.preventDefault();
  clearError(el.quickSearchError);
  const input = currentSearchInput();
  const error = validateSearch(input);
  if (error) return showError(el.quickSearchError, error);

  syncSearchControls(input);
  el.quickSearchButton.disabled = true;
  el.quickSearchButton.querySelector('span').textContent = input.fullTank ? 'Calculando el depósito completo…' : 'Buscando la mejor opción…';
  el.stationList.innerHTML = '<div class="loading">Comparando precios, distancia y consumo del trayecto…</div>';
  el.bestResult.hidden = true;

  try {
    const payload = await fetchRecommendation(input);
    const best = payload.best;
    const nearest = payload.nearest || best;
    const saving = Number(payload.saving || 0);
    if (input.fullTank) input.amount = Number(best.tankCost || input.tankCapacity * best.price);
    state.currentSimulation = {
      best,
      nearest,
      saving,
      input,
      mode: input.fullTank ? 'fullTank' : 'amount',
      radius: input.radius,
      vehicleId: input.vehicleId,
      registered: false,
      serverCalculated: true
    };
    renderBestResult();
    renderStations();
    renderMapPreview();
    await checkFavoritePrices(false);
    el.bestResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (searchError) {
    el.stationList.replaceChildren(emptyState(searchError.message));
    showError(el.quickSearchError, searchError.message);
  } finally {
    el.quickSearchButton.disabled = false;
    updateSearchModeUi();
  }
}

async function runFullTankSearch({ openRoute = false } = {}) {
  clearError(el.quickSearchError);
  const vehicle = activeVehicle();
  if (!vehicle || !Number.isFinite(Number(vehicle.tank)) || Number(vehicle.tank) <= 0) {
    toast('Añade un vehículo con la capacidad de su depósito.');
    openVehicleDialog(vehicle || null);
    return;
  }
  const input = {
    vehicle,
    vehicleId: vehicle.id,
    fuelKey: vehicle.fuelKey,
    consumption: Number(vehicle.consumption),
    tankCapacity: Number(vehicle.tank),
    amount: 0,
    radius: Number(el.quickRadius.value) || Number(state.filters.radius) || 15,
    tripMode: $('input[name="quickTrip"]:checked')?.value || state.filters.tripMode || 'roundtrip',
    discounts: state.discounts,
    fullTank: true
  };
  const error = validateSearch(input);
  if (error) {
    toast(error);
    openVehicleDialog(vehicle);
    return;
  }

  syncSearchControls({ ...input, amount: state.filters.amount || 50 });
  if (el.fullTankButton) {
    el.fullTankButton.disabled = true;
    const label = el.fullTankButton.querySelector('span');
    if (label) label.textContent = 'Calculando la mejor opción…';
  }
  el.stationList.innerHTML = '<div class="loading">Comparando el coste del depósito y del desplazamiento…</div>';
  el.bestResult.hidden = true;

  try {
    const payload = await fetchRecommendation(input);
    const best = payload.best;
    const nearest = payload.nearest || best;
    const saving = Number(payload.saving || 0);
    input.amount = Number(best.tankCost || input.tankCapacity * best.price);
    state.currentSimulation = {
      best,
      nearest,
      saving,
      input,
      mode: 'fullTank',
      radius: input.radius,
      vehicleId: vehicle.id,
      registered: false,
      serverCalculated: true
    };
    renderBestResult();
    renderStations();
    renderMapPreview();
    await checkFavoritePrices(false);
    el.bestResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (openRoute) window.setTimeout(() => { window.location.href = mapsUrl(best); }, 250);
  } catch (searchError) {
    el.stationList.replaceChildren(emptyState(searchError.message));
    showError(el.quickSearchError, searchError.message);
  } finally {
    if (el.fullTankButton) {
      el.fullTankButton.disabled = false;
      const label = el.fullTankButton.querySelector('span');
      if (label) label.textContent = 'Buscar la mejor gasolinera';
    }
  }
}

async function searchStations() {
  el.quickFuel.value = el.listFuel.value;
  el.quickRadius.value = el.listRadius.value;
  state.filters.sort = el.listSort.value;
  if (el.quickVehicle.value) {
    const vehicle = state.vehicles.find(item => item.id === el.quickVehicle.value);
    if (vehicle && vehicle.fuelKey !== el.listFuel.value) {
      el.quickVehicle.value = '';
      state.selectedVehicleId = '';
      el.manualVehicleFields.hidden = false;
    }
  }
  await executeSearch();
}

function renderBestResult() {
  const simulation = state.currentSimulation;
  if (!simulation) { el.bestResult.hidden = true; return; }
  const { best, nearest, saving } = simulation;
  el.bestName.textContent = best.name;
  el.bestAddress.textContent = best.address;
  el.bestPrice.textContent = `${num(best.price)} €/l`;
  const isRoundTrip = simulation.input.tripMode !== 'oneway';
  const calculatedTripKm = Number(best.tripKm ?? (best.roadDistanceKm * (isRoundTrip ? 2 : 1)));
  const refuelCost = simulation.mode === 'fullTank'
    ? Number(best.tankCost ?? simulation.input.amount)
    : Number(simulation.input.amount);
  el.bestDistance.textContent = `${num(calculatedTripKm, 1)} km · ${isRoundTrip ? 'ida y vuelta' : 'solo ida'}`;
  el.bestNetLiters.textContent = `${num(best.netLiters, 2)} l`;
  if (el.bestRefuelCost) el.bestRefuelCost.textContent = euro.format(refuelCost);
  el.bestSaving.textContent = euro.format(saving);
  el.bestSavingCopy.textContent = simulation.mode === 'fullTank'
    ? (nearest.id === best.id ? 'la opción más cercana también es la mejor para llenar el depósito' : `frente a llenar el depósito en ${nearest.name}`)
    : (nearest.id === best.id ? 'la opción más cercana también es la mejor' : `frente a ${nearest.name}`);
  el.bestRoute.href = mapsUrl(best);
  el.bestFavorite.textContent = isFavorite(best.id) ? '★' : '☆';
  el.bestFavorite.classList.toggle('is-favorite', isFavorite(best.id));
  el.markRefueled.disabled = Boolean(simulation.registered);
  el.markRefueled.textContent = simulation.registered ? 'REPOSTAJE GUARDADO' : 'Marcar como REPOSTADO';
  el.bestResult.hidden = false;
}

async function openComparison(selectedStation) {
  const simulation = state.currentSimulation;
  if (!simulation?.best) {
    toast('Realiza primero una búsqueda para calcular la mejor opción.');
    return;
  }

  const input = { ...simulation.input, discounts: state.discounts };
  try {
    await requestPosition();
    const payload = await apiFetch('compare-stations', '', {
      method: 'POST',
      body: recommendationRequest(input, selectedStation.id)
    });
    const comparison = payload.comparison;
    if (!comparison?.best || !comparison?.selected) throw new Error('No se pudo comparar esa gasolinera.');
    const { best, selected } = comparison;
    const saving = Number(comparison.saving || 0);
    const extraUsefulLiters = Number(comparison.extraUsefulLiters || 0);
    const referenceLiters = Number(comparison.referenceLiters || best.netLiters || 0);
    const tripLabel = input.tripMode === 'oneway' ? 'solo ida' : 'ida y vuelta';
    const bestEquivalentCost = Number(best.effectivePrice) * referenceLiters;
    const selectedEquivalentCost = Number(selected.effectivePrice) * referenceLiters;

    el.compareBestName.textContent = best.name;
    el.compareBestPrice.textContent = `${num(best.price)} €/l`;
    el.compareBestTrip.textContent = `${num(best.tripKm, 1)} km · ${tripLabel}`;
    el.compareBestTripFuel.textContent = `${num(best.tripLiters, 2)} l`;
    el.compareBestCost.textContent = euro.format(bestEquivalentCost);

    el.compareSelectedName.textContent = selected.name;
    el.compareSelectedPrice.textContent = `${num(selected.price)} €/l`;
    el.compareSelectedTrip.textContent = `${num(selected.tripKm, 1)} km · ${tripLabel}`;
    el.compareSelectedTripFuel.textContent = `${num(selected.tripLiters, 2)} l`;
    el.compareSelectedCost.textContent = euro.format(selectedEquivalentCost);

    el.compareSaving.textContent = euro.format(saving);
    if (String(best.id) === String(selected.id)) {
      el.compareSavingCopy.textContent = 'La gasolinera seleccionada ya es la mejor opción por precio y desplazamiento.';
    } else {
      const modeCopy = simulation.mode === 'fullTank'
        ? 'para obtener la misma cantidad útil tras llenar el depósito'
        : `para obtener los mismos ${num(referenceLiters, 2)} litros útiles`;
      el.compareSavingCopy.textContent = `Ahorras ${euro.format(saving)} ${modeCopy}. Además aprovechas ${num(extraUsefulLiters, 2)} litros útiles más con el mismo criterio de búsqueda.`;
    }
    el.compareBestRoute.href = mapsUrl(best);
    openDialog(el.comparisonDialog);
  } catch (error) {
    toast(error.message || 'No se pudo realizar la comparación.');
  }
}

function renderStations() {
  const items = filteredStations();
  el.stationList.replaceChildren();
  el.listSummary.textContent = state.stations.length ? `${items.length} gasolineras comparadas` : 'Pulsa el botón principal para comenzar';
  if (!items.length) {
    el.stationList.appendChild(emptyState(state.stations.length ? 'No hay resultados con estos filtros.' : 'Todavía no has realizado una búsqueda.'));
    return;
  }

  const input = rankingInput();
  const scores = new Map(rankStations(state.stations, input).map((station, index) => [String(station.id), { station, index }]));

  for (const station of items) {
    const scoreInfo = scores.get(String(station.id));
    const scored = scoreInfo?.station || (input.fullTank ? rankFullTankStations([station], input)[0] : scoreNormalizedStation(station, input));
    const node = el.stationCardTemplate.content.cloneNode(true);
    const card = node.querySelector('.station-card');
    const main = node.querySelector('.station-main');
    const isBest = state.currentSimulation?.best && String(state.currentSimulation.best.id) === String(station.id);
    card.classList.toggle('is-best', Boolean(isBest));

    node.querySelector('.station-name').textContent = station.name;
    node.querySelector('.station-address').textContent = station.address;
    const open = node.querySelector('.station-open');
    open.textContent = station.isOpen === true ? 'ABIERTA' : station.isOpen === false ? 'CERRADA' : 'ESTADO N/D';
    open.classList.toggle('closed', station.isOpen === false);
    node.querySelector('.station-fuel-label').textContent = fuelLabel(state.filters.fuelKey);
    node.querySelector('.station-price').textContent = displayPrice(station);
    const discount = discountForStation(station, state.filters.fuelKey, state.discounts);
    node.querySelector('.station-discount').textContent = discount ? `Descuento: −${num(discount)} €/l` : '';
    node.querySelector('.station-distance').textContent = `${num(station.distanceKm, 1)} km`;
    node.querySelector('.station-hours').textContent = station.schedule;
    node.querySelector('.station-net').textContent = scored ? `${num(scored.netLiters, 2)} l útiles tras el trayecto` : '';
    node.querySelector('.station-rank-note').textContent = isBest ? 'MEJOR OPCIÓN' : scoreInfo ? `Puesto ${scoreInfo.index + 1}` : '';
    main.addEventListener('click', () => openStationDetail(station));

    const favorite = node.querySelector('.favorite-btn');
    favorite.textContent = isFavorite(station.id) ? '★' : '☆';
    favorite.classList.toggle('is-favorite', isFavorite(station.id));
    favorite.addEventListener('click', () => toggleFavorite(station));
    node.querySelector('.compare-btn').addEventListener('click', () => openComparison(station));
    node.querySelector('.route-btn').href = mapsUrl(station);
    el.stationList.appendChild(node);
  }
}

function emptyState(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<strong>Sin datos</strong><p>${escapeHtml(message)}</p>`;
  return div;
}

function scrollToSearch(station = null) {
  closeDialog(el.stationDialog);
  navigate('list');
  if (station) el.quickRadius.value = Math.max(Number(el.quickRadius.value) || 1, Math.ceil(station.distanceKm + 1));
  setTimeout(() => {
    el.quickSearchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.quickAmount.focus({ preventScroll: true });
  }, 120);
}

function toggleFavorite(station) {
  const existing = favoriteById(station.id);
  if (existing) {
    state.favorites = state.favorites.filter(favorite => String(favorite.id) !== String(station.id));
    toast('Eliminada de favoritas');
  } else {
    state.favorites.push({
      id: station.id,
      name: station.name,
      address: station.address,
      brand: station.brand,
      latitude: station.latitude,
      longitude: station.longitude,
      distanceKm: station.distanceKm,
      watchFuel: state.filters.fuelKey,
      notifications: true,
      lastPrice: stationBasePrice(station, state.filters.fuelKey),
      lastChecked: nowIso()
    });
    toast('Añadida a favoritas');
  }
  saveFavorites();
  renderBestResult();
  if (state.currentStation?.id === station.id) updateDetailFavoriteButtons();
}

function renderFavorites() {
  el.favoriteList.replaceChildren();
  el.favoriteCount.textContent = state.favorites.length;
  el.favoriteNavBadge.textContent = state.favorites.length;
  el.favoriteNavBadge.hidden = !state.favorites.length;
  el.globalNotificationsToggle.textContent = state.settings.notificationsEnabled ? 'Activados' : 'Desactivados';
  el.globalNotificationsToggle.setAttribute('aria-pressed', String(state.settings.notificationsEnabled));
  if (!state.favorites.length) {
    el.favoriteList.appendChild(emptyState('Pulsa la estrella de una gasolinera para guardarla.'));
    return;
  }

  for (const favorite of state.favorites) {
    const node = el.favoriteCardTemplate.content.cloneNode(true);
    node.querySelector('.favorite-name').textContent = favorite.name;
    node.querySelector('.favorite-address').textContent = favorite.address;
    const fuel = node.querySelector('.favorite-fuel');
    fillFuelSelect(fuel);
    fuel.value = favorite.watchFuel || state.filters.fuelKey;
    fuel.addEventListener('change', () => {
      favorite.watchFuel = fuel.value;
      favorite.lastPrice = null;
      saveFavorites();
    });
    const alert = node.querySelector('.favorite-alert');
    alert.checked = favorite.notifications !== false;
    alert.addEventListener('change', () => {
      favorite.notifications = alert.checked;
      saveFavorites();
    });
    node.querySelector('.favorite-current-price').textContent = favorite.lastPrice ? `${num(favorite.lastPrice)} €/l` : 'Pendiente';
    const change = node.querySelector('.favorite-change');
    if (Number.isFinite(favorite.lastChange) && favorite.lastChange !== 0) {
      change.textContent = `${favorite.lastChange > 0 ? '+' : ''}${num(favorite.lastChange)} €/l`;
      change.className = `favorite-change ${favorite.lastChange > 0 ? 'up' : 'down'}`;
    } else {
      change.textContent = favorite.lastChecked ? `Comprobada ${new Date(favorite.lastChecked).toLocaleString('es-ES')}` : 'Sin comprobar';
    }
    node.querySelector('.favorite-open').addEventListener('click', () => {
      const station = state.stations.find(item => String(item.id) === String(favorite.id)) || favorite;
      openStationDetail(station);
    });
    node.querySelector('.favorite-remove').addEventListener('click', () => toggleFavorite(favorite));
    el.favoriteList.appendChild(node);
  }
}

function renderHomeWidgets() {
  if (!el.favoriteWidgetList) return;
  el.favoriteWidgetList.replaceChildren();
  const favorites = state.favorites.slice(0, 3);
  if (!favorites.length) {
    const empty = document.createElement('p');
    empty.className = 'widget-empty';
    empty.textContent = 'Guarda gasolineras como favoritas para ver aquí sus precios y cambios.';
    el.favoriteWidgetList.appendChild(empty);
  } else {
    for (const favorite of favorites) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'favorite-widget-row';
      const change = Number(favorite.lastChange);
      const changeClass = Number.isFinite(change) && change !== 0 ? (change > 0 ? 'up' : 'down') : 'same';
      const changeText = Number.isFinite(change) && change !== 0
        ? `${change > 0 ? '▲' : '▼'} ${num(Math.abs(change))} €/l`
        : 'Sin cambios';
      row.innerHTML = `
        <span class="favorite-widget-main"><strong>${escapeHtml(favorite.name)}</strong><small>${escapeHtml(fuelLabel(favorite.watchFuel || state.filters.fuelKey))}</small></span>
        <span class="favorite-widget-price"><strong>${favorite.lastPrice ? `${num(favorite.lastPrice)} €/l` : 'Pendiente'}</strong><small class="${changeClass}">${changeText}</small></span>`;
      row.addEventListener('click', () => {
        const station = state.stations.find(item => String(item.id) === String(favorite.id)) || favorite;
        openStationDetail(station);
      });
      el.favoriteWidgetList.appendChild(row);
    }
  }
  const vehicle = activeVehicle();
  if (el.fullTankHint) {
    el.fullTankHint.textContent = vehicle
      ? `${vehicle.name} · ${fuelLabel(vehicle.fuelKey)} · depósito de ${num(Number(vehicle.tank), 0)} l`
      : 'Añade un vehículo con consumo, combustible y capacidad de depósito.';
  }
}

function recordSnapshots(stations) {
  const timestamp = Date.now();
  for (const station of stations) {
    for (const fuel of station.fuels) {
      const key = `${station.id}:${fuel.key}`;
      const points = state.snapshots[key] || [];
      const last = points[points.length - 1];
      if (!last || Math.abs(last.price - fuel.price) > 0.0005 || timestamp - last.ts > 60 * 60 * 1000) {
        points.push({ ts: timestamp, price: fuel.price });
      }
      state.snapshots[key] = points.filter(point => timestamp - point.ts < 30 * 24 * 60 * 60 * 1000).slice(-240);
    }
  }
  saveSnapshots();
}
function snapshotHistory(stationId, fuelKey) {
  return (state.snapshots[`${stationId}:${fuelKey}`] || []).filter(point => Date.now() - point.ts < 24 * 60 * 60 * 1000);
}

async function checkFavoritePrices(notify = true) {
  if (!state.favorites.length) return;
  let changed = false;
  for (const favorite of state.favorites) {
    if (!favorite.latitude || !favorite.longitude) continue;
    try {
      const params = new URLSearchParams({
        latitud: Number(favorite.latitude).toFixed(6),
        longitud: Number(favorite.longitude).toFixed(6),
        radio: '1', pagina: '1', limite: '50', fields: 'current'
      });
      const stations = extractStationArray(await apiFetch('/estaciones/radio', params))
        .map(raw => normalizeStationForList(raw, { latitude: favorite.latitude, longitude: favorite.longitude }))
        .filter(Boolean);
      const station = stations.find(item => String(item.id) === String(favorite.id))
        || stations.find(item => item.name.toLowerCase() === favorite.name.toLowerCase())
        || stations[0];
      if (!station) continue;
      const price = stationBasePrice(station, favorite.watchFuel);
      if (!price) continue;
      const previous = Number(favorite.lastPrice);
      favorite.lastPrice = price;
      favorite.lastChecked = nowIso();
      favorite.lastChange = Number.isFinite(previous) ? price - previous : 0;
      changed = true;
      recordSnapshots([station]);
      if (notify && Number.isFinite(previous) && shouldNotify(favorite.lastChange) && favorite.notifications !== false && state.settings.notificationsEnabled) {
        await showPriceNotification(favorite, previous, price);
      }
    } catch { /* se reintentará después */ }
  }
  if (changed) saveFavorites();
}

function shouldNotify(change) {
  const threshold = Number(state.settings.notificationThreshold) || 0.001;
  if (Math.abs(change) < threshold) return false;
  if (state.settings.notificationDirection === 'down') return change < 0;
  if (state.settings.notificationDirection === 'up') return change > 0;
  return true;
}

async function showPriceNotification(favorite, oldPrice, newPrice) {
  const direction = newPrice < oldPrice ? 'ha bajado' : 'ha subido';
  const title = `El ${fuelLabel(favorite.watchFuel)} ${direction}`;
  const body = `${favorite.name}: de ${num(oldPrice)} a ${num(newPrice)} €/l`;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    if (Notification.permission === 'granted') {
      await registration.showNotification(title, {
        body,
        icon: './assets/icon-192.png',
        badge: './assets/icon-192.png',
        tag: `price-${favorite.id}-${favorite.watchFuel}`,
        data: { url: './#favorites' }
      });
    }
  }
}


async function loadServerHistory(station, fuelKey) {
  if (!station?.id || !fuelKey || !state.settings.supabaseFunctionsUrl) return;
  try {
    const params = new URLSearchParams({
      stationId: station.id,
      fuelKey,
      hours: '168',
      limit: '500'
    });
    const payload = await apiFetch('station-history', params.toString());
    const points = Array.isArray(payload?.items)
      ? payload.items
          .map(item => ({
            ts: Date.parse(item.observedAt || item.observed_at || ''),
            price: Number(item.price)
          }))
          .filter(item => Number.isFinite(item.ts) && Number.isFinite(item.price))
      : [];
    if (state.currentStation?.id === station.id && state.filters.fuelKey === fuelKey && points.length) {
      renderHistoryChart(points);
    }
  } catch {
    // El gráfico local permanece disponible si el histórico del servidor no responde.
  }
}

function openStationDetail(station) {
  state.currentStation = station;
  const fuelKey = state.filters.fuelKey;
  el.detailBrand.textContent = station.brand || 'GASOLINERA';
  el.detailName.textContent = station.name;
  el.detailAddress.textContent = station.address;
  el.detailFuelTable.replaceChildren();
  for (const fuel of station.fuels || []) {
    const row = document.createElement('div');
    row.className = `detail-fuel-row ${fuel.key === fuelKey ? 'is-selected' : ''}`;
    const price = personalPrice(station, fuel.key, state.discounts);
    row.innerHTML = `<strong>${escapeHtml(fuel.label)}</strong><b>${num(price)} €</b>`;
    row.addEventListener('click', () => {
      state.filters.fuelKey = fuel.key;
      el.listFuel.value = fuel.key;
      el.quickFuel.value = fuel.key;
      saveFilters();
      openStationDetail(station);
    });
    el.detailFuelTable.appendChild(row);
  }
  el.detailOpen.textContent = station.isOpen === true ? 'ABIERTA' : station.isOpen === false ? 'CERRADA' : 'ESTADO N/D';
  el.detailHours.textContent = station.schedule || 'Horario no disponible';
  el.detailDistance.textContent = `${num(station.distanceKm || 0, 1)} km`;

  const price = stationPrice(station, fuelKey);
  const average = averagePrice(state.stations, fuelKey, state.discounts);
  const range = priceRange(state.stations, fuelKey, state.discounts);
  el.detailSelectedPrice.textContent = price ? `${num(price)} €` : '—';
  el.detailAverageText.textContent = average ? `· media ${num(average)} €` : '';
  if (range && price) {
    const span = Math.max(0.001, range.max - range.min);
    const percentage = Math.max(0, Math.min(100, (price - range.min) / span * 100));
    el.detailScaleMarker.style.left = `${percentage}%`;
    el.detailScaleMin.textContent = `${num(range.min)} €`;
    el.detailScaleMax.textContent = `${num(range.max)} €`;
  } else {
    el.detailScaleMarker.style.left = '50%';
    el.detailScaleMin.textContent = '—';
    el.detailScaleMax.textContent = '—';
  }
  renderHistoryChart(snapshotHistory(station.id, fuelKey));
  loadServerHistory(station, fuelKey);
  el.detailRoute.href = mapsUrl(station);
  updateDetailFavoriteButtons();
  openDialog(el.stationDialog);
}

function updateDetailFavoriteButtons() {
  const favorite = state.currentStation && isFavorite(state.currentStation.id);
  el.detailFavorite.classList.toggle('is-active', favorite);
  el.detailFavorite.querySelector('span').textContent = favorite ? '★' : '☆';
  el.detailAlert.classList.toggle('is-active', favoriteById(state.currentStation?.id)?.notifications === true);
}

function renderHistoryChart(points) {
  el.priceHistoryChart.replaceChildren();
  if (points.length < 2) {
    el.detailTrend.textContent = 'Aún no hay suficientes datos';
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '280');
    text.setAttribute('y', '84');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#cdd3df');
    text.textContent = 'El historial se crea con las comprobaciones de precio';
    el.priceHistoryChart.appendChild(text);
    return;
  }
  const min = Math.min(...points.map(point => point.price));
  const max = Math.max(...points.map(point => point.price));
  const span = Math.max(0.001, max - min);
  const first = points[0].ts;
  const last = points.at(-1).ts;
  const timeSpan = Math.max(1, last - first);
  const coordinates = points.map(point => `${20 + (point.ts - first) / timeSpan * 520},${140 - (point.price - min) / span * 110}`).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', coordinates);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '5');
  line.setAttribute('stroke-linejoin', 'round');
  el.priceHistoryChart.appendChild(line);
  const change = points.at(-1).price - points[0].price;
  el.detailTrend.textContent = Math.abs(change) < 0.0005 ? 'Precio estable' : `Tendencia ${change > 0 ? 'subiendo ↗' : 'bajando ↘'}`;
}

function mapStations() {
  let items = filteredStations();
  if (state.filters.mapMode === 'top10' || el.mapTopTenToggle.getAttribute('aria-pressed') === 'true') {
    items = [...items].sort((a, b) => stationPrice(a) - stationPrice(b)).slice(0, 10);
  }
  return items;
}

function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (state.mapsPromise) return state.mapsPromise;
  const apiKey = String(state.settings.googleMapsKey || '').trim();
  if (!apiKey) return Promise.reject(new Error('Google Maps no está configurado. Se mostrará el mapa alternativo.'));

  state.mapsPromise = new Promise((resolve, reject) => {
    const callback = `combusplusMapsReady_${Date.now()}`;
    const previousAuthFailure = window.gm_authFailure;
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { delete window[callback]; } catch { window[callback] = undefined; }
      window.gm_authFailure = previousAuthFailure;
      if (error) {
        state.mapsPromise = null;
        reject(error);
      } else {
        resolve(window.google.maps);
      }
    };
    window[callback] = () => finish(null);
    window.gm_authFailure = () => finish(new Error('Google Maps ha rechazado la clave o sus restricciones. Se mostrará el mapa alternativo.'));

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
      loading: 'async'
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${query.toString()}`;
    script.onerror = () => finish(new Error('No se pudo descargar Google Maps. Se mostrará el mapa alternativo.'));
    document.head.appendChild(script);
    const timeout = setTimeout(() => finish(new Error('Google Maps ha tardado demasiado. Se mostrará el mapa alternativo.')), 12000);
  });
  return state.mapsPromise;
}

function renderOpenStreetMapFallback(items, cause = '') {
  const station = state.currentSimulation?.best || items[0];
  el.googleMap.innerHTML = '';
  if (!station || !Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) {
    el.googleMap.appendChild(emptyState(cause || 'No hay una ubicación válida para mostrar el mapa.'));
    return;
  }
  const lat = station.latitude;
  const lon = station.longitude;
  const deltaLat = 0.06;
  const deltaLon = 0.09;
  const bbox = [lon - deltaLon, lat - deltaLat, lon + deltaLon, lat + deltaLat].join(',');
  const frameUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  const route = mapsUrl(station);
  const wrapper = document.createElement('div');
  wrapper.className = 'map-fallback';
  wrapper.innerHTML = `<iframe title="Mapa de ${escapeHtml(station.name)}" loading="lazy" referrerpolicy="no-referrer" src="${frameUrl}"></iframe><div class="map-fallback-note"><span>${escapeHtml(cause || 'Mapa alternativo activo')} · Marcador en ${escapeHtml(station.name)}</span><a href="${route}" target="_blank" rel="noopener noreferrer">Abrir ruta</a></div>`;
  el.googleMap.appendChild(wrapper);
}

async function renderMap() {
  if (!state.stations.length) {
    el.googleMap.innerHTML = '';
    el.googleMap.appendChild(emptyState('Realiza una búsqueda desde la pestaña Buscar.'));
    return;
  }
  const items = mapStations();
  try {
    const maps = await loadGoogleMaps();
    const center = state.position ? { lat: state.position.latitude, lng: state.position.longitude } : { lat: items[0]?.latitude || 40.4168, lng: items[0]?.longitude || -3.7038 };
    if (!state.map) {
      const mapOptions = {
        center,
        zoom: 12,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy'
      };
      const mapId = String(state.settings.googleMapId || '').trim();
      if (mapId && mapId !== 'DEMO_MAP_ID') mapOptions.mapId = mapId;
      state.map = new maps.Map(el.googleMap, mapOptions);
    }
    state.map.setCenter(center);
    state.markers.forEach(marker => marker.setMap?.(null));
    state.markers = [];
    for (const station of items) {
      if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) continue;
      const marker = new maps.Marker({
        position: { lat: station.latitude, lng: station.longitude },
        map: state.map,
        title: station.name,
        label: { text: num(stationPrice(station), 2), color: '#fff', fontWeight: '700' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: isFavorite(station.id) ? '#dca000' : '#b3131b',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2
        }
      });
      marker.addListener('click', () => openStationDetail(station));
      state.markers.push(marker);
    }
    el.mapModeLabel.textContent = state.filters.mapMode === 'top10' ? '10 más baratas' : `${items.length} gasolineras`;
    renderMapPreview();
  } catch (error) {
    renderOpenStreetMapFallback(items, error.message);
    el.mapModeLabel.textContent = `${items.length} gasolineras · mapa alternativo`;
    renderMapPreview();
  }
}

function renderMapPreview() {
  const items = mapStations().slice(0, 6);
  el.mapPreviewList.replaceChildren();
  for (const station of items) {
    const article = document.createElement('article');
    article.className = 'station-card';
    article.style.display = 'block';
    article.innerHTML = `<button class="station-main" type="button"><strong class="station-name">${escapeHtml(station.name)}</strong><span class="station-address">${escapeHtml(station.address)}</span><div class="station-price-row"><strong class="station-price">${escapeHtml(displayPrice(station))}</strong><span>${num(station.distanceKm, 1)} km</span></div></button>`;
    article.querySelector('button').addEventListener('click', () => openStationDetail(station));
    el.mapPreviewList.appendChild(article);
  }
}

function markRefueled() {
  const simulation = state.currentSimulation;
  if (!simulation || simulation.registered) return;
  const selectedVehicleId = simulation.vehicleId || state.selectedVehicleId;
  const item = {
    id: uid('refuel'),
    date: nowIso(),
    stationId: simulation.best.id,
    stationName: simulation.best.name,
    address: simulation.best.address,
    vehicleId: selectedVehicleId,
    vehicleName: state.vehicles.find(vehicle => vehicle.id === selectedVehicleId)?.name || 'Datos manuales',
    fuelKey: simulation.input.fuelKey,
    price: simulation.best.price,
    amount: simulation.input.amount,
    liters: simulation.best.purchasedLiters,
    distanceKm: simulation.best.roadDistanceKm,
    saving: simulation.saving
  };
  state.history.unshift(item);
  simulation.registered = true;
  saveHistory();
  renderBestResult();
  toast('Repostaje guardado en tu perfil');
}

function renderStats() {
  const totalSaving = state.history.reduce((sum, item) => sum + (Number(item.saving) || 0), 0);
  const totalAmount = state.history.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalLiters = state.history.reduce((sum, item) => sum + (Number(item.liters) || 0), 0);
  el.statSaving.textContent = euro.format(totalSaving);
  el.statRefuels.textContent = state.history.length;
  el.statAmount.textContent = euro.format(totalAmount);
  el.statLiters.textContent = `${num(totalLiters, 2)} l`;

  el.refuelHistory.replaceChildren();
  if (!state.history.length) el.refuelHistory.appendChild(emptyState('Marca una recomendación como REPOSTADO para crear el historial.'));
  for (const item of state.history) {
    const node = document.createElement('article');
    node.className = 'history-item';
    node.innerHTML = `<div><strong>${escapeHtml(item.stationName)}</strong><span>${new Date(item.date).toLocaleString('es-ES')} · ${escapeHtml(fuelLabel(item.fuelKey))} · ${euro.format(item.amount)}</span><span>Ahorro estimado: ${euro.format(item.saving || 0)} · ${num(item.liters, 2)} l</span></div><div class="row-actions"><button class="danger" type="button">Eliminar</button></div>`;
    node.querySelector('button').addEventListener('click', () => {
      state.history = state.history.filter(historyItem => historyItem.id !== item.id);
      saveHistory();
    });
    el.refuelHistory.appendChild(node);
  }
  renderVehicles();
  renderDiscounts();
}

function renderVehicles() {
  el.vehicleList.replaceChildren();
  if (!state.vehicles.length) {
    el.vehicleList.appendChild(emptyState('Añade un vehículo para buscar con solo indicar el importe.'));
    return;
  }
  for (const vehicle of state.vehicles) {
    const node = document.createElement('article');
    node.className = 'vehicle-item';
    node.innerHTML = `<div><strong>${escapeHtml(vehicle.name)}${vehicle.id === state.selectedVehicleId ? ' · ACTIVO' : ''}</strong><span>${escapeHtml(vehicle.plate || 'Sin matrícula')} · ${fuelLabel(vehicle.fuelKey)} · ${num(vehicle.consumption, 1)} l/100 km · depósito ${num(vehicle.tank || 50, 0)} l</span></div><div class="row-actions"><button class="use" type="button">Usar</button><button class="edit" type="button">Editar</button><button class="danger delete" type="button">Eliminar</button></div>`;
    node.querySelector('.use').addEventListener('click', () => {
      state.selectedVehicleId = vehicle.id;
      saveVehicles();
      navigate('list');
    });
    node.querySelector('.edit').addEventListener('click', () => openVehicleDialog(vehicle));
    node.querySelector('.delete').addEventListener('click', () => {
      state.vehicles = state.vehicles.filter(item => item.id !== vehicle.id);
      if (state.selectedVehicleId === vehicle.id) state.selectedVehicleId = state.vehicles[0]?.id || '';
      saveVehicles();
    });
    el.vehicleList.appendChild(node);
  }
}

function openVehicleDialog(vehicle = null) {
  el.vehicleForm.reset();
  clearError(el.vehicleError);
  el.vehicleId.value = vehicle?.id || '';
  el.vehicleDialogTitle.textContent = vehicle ? 'Editar vehículo' : 'Añadir vehículo';
  el.vehicleName.value = vehicle?.name || '';
  el.vehiclePlate.value = vehicle?.plate || '';
  el.vehicleTank.value = vehicle?.tank || 50;
  el.vehicleConsumption.value = vehicle?.consumption || 6;
  el.vehicleFuel.value = vehicle?.fuelKey || state.filters.fuelKey;
  openDialog(el.vehicleDialog);
}

function saveVehicleForm(event) {
  event.preventDefault();
  clearError(el.vehicleError);
  const vehicle = {
    id: el.vehicleId.value || uid('vehicle'),
    name: el.vehicleName.value.trim(),
    plate: el.vehiclePlate.value.trim(),
    tank: Number(el.vehicleTank.value),
    consumption: Number(el.vehicleConsumption.value),
    fuelKey: el.vehicleFuel.value
  };
  if (!vehicle.name) return showError(el.vehicleError, 'Indica un nombre.');
  if (!Number.isFinite(vehicle.tank) || vehicle.tank < 10 || vehicle.tank > 200) return showError(el.vehicleError, 'Indica un depósito entre 10 y 200 litros.');
  if (!Number.isFinite(vehicle.consumption) || vehicle.consumption < 1 || vehicle.consumption > 30) return showError(el.vehicleError, 'Consumo no válido.');
  const index = state.vehicles.findIndex(item => item.id === vehicle.id);
  if (index >= 0) state.vehicles[index] = vehicle;
  else state.vehicles.unshift(vehicle);
  state.selectedVehicleId = vehicle.id;
  saveVehicles();
  closeDialog(el.vehicleDialog);
  toast('Vehículo guardado');
}

function renderDiscounts() {
  el.discountList.replaceChildren();
  if (!state.discounts.length) {
    el.discountList.appendChild(emptyState('No hay descuentos guardados.'));
    return;
  }
  for (const discount of state.discounts) {
    const node = document.createElement('article');
    node.className = 'discount-item';
    node.innerHTML = `<div><strong>${escapeHtml(discount.name)}</strong><span>${discount.stationMatch ? `Aplicado a: ${escapeHtml(discount.stationMatch)}` : 'Todas las estaciones'} · ${discount.fuelKey === 'all' ? 'Todos los combustibles' : fuelLabel(discount.fuelKey)}</span><span>${discount.type === 'percent' ? `${num(discount.value, 1)} %` : `${num(discount.value)} €/l`}</span></div><div class="row-actions"><button class="edit" type="button">Editar</button><button class="danger delete" type="button">Eliminar</button></div>`;
    node.querySelector('.edit').addEventListener('click', () => openDiscountDialog(discount));
    node.querySelector('.delete').addEventListener('click', () => {
      state.discounts = state.discounts.filter(item => item.id !== discount.id);
      saveDiscounts();
    });
    el.discountList.appendChild(node);
  }
}

function openDiscountDialog(discount = null) {
  el.discountForm.reset();
  clearError(el.discountError);
  el.discountId.value = discount?.id || '';
  el.discountDialogTitle.textContent = discount ? 'Editar descuento' : 'Añadir descuento';
  el.discountName.value = discount?.name || '';
  el.discountStation.value = discount?.stationMatch || '';
  el.discountFuel.value = discount?.fuelKey || 'all';
  el.discountType.value = discount?.type || 'perLiter';
  el.discountValue.value = discount?.value || 0.05;
  openDialog(el.discountDialog);
}

function saveDiscountForm(event) {
  event.preventDefault();
  clearError(el.discountError);
  const discount = {
    id: el.discountId.value || uid('discount'),
    name: el.discountName.value.trim(),
    stationMatch: el.discountStation.value.trim(),
    fuelKey: el.discountFuel.value,
    type: el.discountType.value,
    value: Number(el.discountValue.value)
  };
  if (!discount.name) return showError(el.discountError, 'Indica un nombre.');
  if (!Number.isFinite(discount.value) || discount.value <= 0) return showError(el.discountError, 'Valor no válido.');
  const index = state.discounts.findIndex(item => item.id === discount.id);
  if (index >= 0) state.discounts[index] = discount;
  else state.discounts.unshift(discount);
  saveDiscounts();
  closeDialog(el.discountDialog);
  toast('Descuento guardado');
}

function populateSettings() {
  el.notificationsEnabled.checked = state.settings.notificationsEnabled;
  el.notificationInterval.value = state.settings.notificationInterval;
  el.notificationThreshold.value = state.settings.notificationThreshold;
  el.notificationDirection.value = state.settings.notificationDirection;
}

function saveSettingsForm(event) {
  event.preventDefault();
  clearError(el.settingsError);
  state.settings = {
    ...state.settings,
    supabaseFunctionsUrl: String(RUNTIME_CONFIG.supabaseFunctionsUrl || state.settings.supabaseFunctionsUrl || '').replace(/\/$/, ''),
    supabasePublishableKey: String(RUNTIME_CONFIG.supabasePublishableKey || state.settings.supabasePublishableKey || ''),
    googleMapsKey: String(RUNTIME_CONFIG.googleMapsKey || state.settings.googleMapsKey || ''),
    googleMapId: String(RUNTIME_CONFIG.googleMapId || state.settings.googleMapId || ''),
    notificationsEnabled: el.notificationsEnabled.checked,
    notificationInterval: Number(el.notificationInterval.value),
    notificationThreshold: Number(el.notificationThreshold.value),
    notificationDirection: el.notificationDirection.value
  };
  saveSettings();
  closeDialog(el.settingsDialog);
  state.mapsPromise = null;
  toast('Preferencias guardadas');
}

async function requestNotificationPermission() {
  if (isNative()) {
    try {
      window.AndroidBridge.requestNotificationPermission();
      toast('Revisa el permiso de notificaciones del sistema');
    } catch { /* puente no disponible */ }
    return;
  }
  if (!('Notification' in window)) return toast('Este navegador no admite notificaciones.');
  const result = await Notification.requestPermission();
  toast(result === 'granted' ? 'Notificaciones permitidas' : 'Permiso no concedido');
}

function syncNativeConfig() {
  if (!window.AndroidBridge?.syncNotificationConfig) return;
  const payload = {
    enabled: state.settings.notificationsEnabled,
    intervalHours: state.settings.notificationInterval,
    threshold: state.settings.notificationThreshold,
    direction: state.settings.notificationDirection,
    supabaseFunctionsUrl: state.settings.supabaseFunctionsUrl,
    supabasePublishableKey: state.settings.supabasePublishableKey,
    installationId: installationId(),
    sessionToken: state.backendSession.token || readStoredValue(STORAGE.sessionToken) || '',
    sessionExpiresAt: Number(state.backendSession.expiresAt || readStoredValue(STORAGE.sessionExpiresAt) || 0),
    selectedVehicleId: state.selectedVehicleId,
    vehicles: state.vehicles,
    discounts: state.discounts,
    favorites: state.favorites.map(favorite => ({
      id: favorite.id,
      name: favorite.name,
      address: favorite.address,
      latitude: favorite.latitude,
      longitude: favorite.longitude,
      watchFuel: favorite.watchFuel,
      lastPrice: favorite.lastPrice,
      lastChange: favorite.lastChange,
      lastChecked: favorite.lastChecked,
      notifications: favorite.notifications !== false
    }))
  };
  try { window.AndroidBridge.syncNotificationConfig(JSON.stringify(payload)); }
  catch { /* puente no disponible */ }
}

function applyFiltersFromDialog() {
  state.filters.openFilter = $('input[name="openFilter"]:checked')?.value || 'all';
  state.filters.mapMode = $('input[name="mapMode"]:checked')?.value || 'all';
  state.filters.priceDisplay = $('input[name="priceDisplay"]:checked')?.value || 'liter';
  saveFilters();
  renderStations();
  renderMap();
  closeDialog(el.filtersDialog);
}

function populateFilters() {
  const open = $(`input[name="openFilter"][value="${state.filters.openFilter}"]`);
  const map = $(`input[name="mapMode"][value="${state.filters.mapMode}"]`);
  const price = $(`input[name="priceDisplay"][value="${state.filters.priceDisplay}"]`);
  if (open) open.checked = true;
  if (map) map.checked = true;
  if (price) price.checked = true;
  el.mapTopTenToggle.setAttribute('aria-pressed', String(state.filters.mapMode === 'top10'));
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    exportedAt: nowIso(),
    vehicles: state.vehicles,
    discounts: state.discounts,
    favorites: state.favorites,
    discounts: state.discounts,
    history: state.history,
    settings: { ...state.settings, supabasePublishableKey: '', googleMapsKey: '' }
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `combusplus-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bind() {
  el.nav.forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    if (button.dataset.nav) navigate(button.dataset.nav);
  }));

  el.openSettings.addEventListener('click', () => { populateSettings(); openDialog(el.settingsDialog); });
  el.quickSearchForm.addEventListener('submit', executeSearch);
  el.quickVehicle.addEventListener('change', applyVehicleToSearch);
  $$('input[name="searchMode"]').forEach(input => input.addEventListener('change', updateSearchModeUi));
  el.quickTankCapacity?.addEventListener('input', updateSearchModeUi);
  el.quickFuel.addEventListener('change', () => { state.filters.fuelKey = el.quickFuel.value; el.listFuel.value = el.quickFuel.value; saveFilters(); });
  el.quickAmount.addEventListener('change', () => { state.filters.amount = Number(el.quickAmount.value); saveFilters(); });
  el.quickRadius.addEventListener('change', () => { state.filters.radius = Number(el.quickRadius.value); el.listRadius.value = el.quickRadius.value; saveFilters(); });
  $$('input[name="quickTrip"]').forEach(input => input.addEventListener('change', () => {
    state.filters.tripMode = input.value;
    saveFilters();
    if (state.currentSimulation) {
      state.currentSimulation = null;
      el.bestResult.hidden = true;
      renderStations();
    }
  }));
  el.refreshLocation.addEventListener('click', async () => {
    try { await requestPosition(true); toast('Ubicación actualizada'); }
    catch (error) { showError(el.quickSearchError, error.message); }
  });
  el.refreshFavoriteWidget?.addEventListener('click', async () => {
    el.refreshFavoriteWidget.disabled = true;
    try {
      await checkFavoritePrices(false);
      toast('Precios favoritos actualizados');
    } finally {
      el.refreshFavoriteWidget.disabled = false;
    }
  });
  el.fullTankButton?.addEventListener('click', () => runFullTankSearch({ openRoute: false }));

  el.bestFavorite.addEventListener('click', () => state.currentSimulation && toggleFavorite(state.currentSimulation.best));
  el.bestDetails.addEventListener('click', () => state.currentSimulation && openStationDetail(state.currentSimulation.best));
  el.markRefueled.addEventListener('click', markRefueled);

  el.openFilters.addEventListener('click', () => { populateFilters(); openDialog(el.filtersDialog); });
  el.searchStations.addEventListener('click', searchStations);
  el.listFuel.addEventListener('change', () => { state.filters.fuelKey = el.listFuel.value; saveFilters(); renderStations(); renderMapPreview(); });
  el.listRadius.addEventListener('change', () => { state.filters.radius = Number(el.listRadius.value); saveFilters(); });
  el.listSort.addEventListener('change', () => { state.filters.sort = el.listSort.value; saveFilters(); renderStations(); });

  el.refreshMap.addEventListener('click', async () => { await searchStations(); navigate('map'); });
  el.configureMap.addEventListener('click', () => renderMap());
  el.mapTopTenToggle.addEventListener('click', () => {
    state.filters.mapMode = state.filters.mapMode === 'top10' ? 'all' : 'top10';
    el.mapTopTenToggle.setAttribute('aria-pressed', String(state.filters.mapMode === 'top10'));
    saveFilters();
    renderMap();
  });

  el.globalNotificationsToggle.addEventListener('click', () => {
    state.settings.notificationsEnabled = !state.settings.notificationsEnabled;
    saveSettings();
    renderFavorites();
    if (state.settings.notificationsEnabled) requestNotificationPermission();
  });

  el.exportData.addEventListener('click', exportData);
  el.clearHistory.addEventListener('click', () => {
    if (confirm('¿Borrar todo el historial?')) { state.history = []; saveHistory(); }
  });
  el.newVehicle.addEventListener('click', () => openVehicleDialog());
  el.newDiscount.addEventListener('click', () => openDiscountDialog());

  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(document.getElementById(button.dataset.closeDialog))));
  $$('dialog').forEach(dialog => dialog.addEventListener('close', () => {
    if (!$$('dialog[open]').length) document.documentElement.classList.remove('dialog-open');
  }));

  el.detailFavorite.addEventListener('click', () => state.currentStation && toggleFavorite(state.currentStation));
  el.detailAlert.addEventListener('click', () => {
    if (!state.currentStation) return;
    let favorite = favoriteById(state.currentStation.id);
    if (!favorite) {
      toggleFavorite(state.currentStation);
      favorite = favoriteById(state.currentStation.id);
    }
    favorite.notifications = !favorite.notifications;
    saveFavorites();
    updateDetailFavoriteButtons();
  });
  el.detailSimulate.addEventListener('click', () => {
    if (!state.currentStation) return;
    closeDialog(el.stationDialog);
    openComparison(state.currentStation);
  });

  el.filtersForm.addEventListener('submit', event => { event.preventDefault(); applyFiltersFromDialog(); });
  el.vehicleForm.addEventListener('submit', saveVehicleForm);
  el.discountForm.addEventListener('submit', saveDiscountForm);
  el.settingsForm.addEventListener('submit', saveSettingsForm);
  el.requestNotifications.addEventListener('click', requestNotificationPermission);
}

function init() {
  loadState();
  fillFuelSelect(el.quickFuel);
  fillFuelSelect(el.listFuel);
  fillFuelSelect(el.vehicleFuel);
  fillFuelSelect(el.discountFuel, true);

  el.quickFuel.value = state.filters.fuelKey;
  el.quickConsumption.value = state.filters.consumption;
  el.quickTankCapacity.value = activeVehicle()?.tank || 50;
  el.quickAmount.value = state.filters.amount;
  el.quickRadius.value = state.filters.radius;
  const trip = $(`input[name="quickTrip"][value="${state.filters.tripMode}"]`);
  if (trip) trip.checked = true;
  el.listFuel.value = state.filters.fuelKey;
  el.listRadius.value = String(state.filters.radius);
  el.listSort.value = state.filters.sort;

  renderVehicleSelector();
  renderStations();
  renderFavorites();
  renderHomeWidgets();
  renderStats();
  populateFilters();
  bind();
  updateSearchModeUi();
  navigate(location.hash.slice(1) || 'list');
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'list'));
  syncNativeConfig();
  ensureBackendSession().then(() => syncNativeConfig()).catch(error => {
    console.error('No se pudo iniciar la sesión segura:', error);
  });
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  setTimeout(() => checkFavoritePrices(true), 1200);
  if (!state.settings.supabaseFunctionsUrl || !state.settings.supabasePublishableKey) {
    console.error('Combusplus no tiene configurado el backend público de Supabase.');
  }
  try {
    if (window.AndroidBridge?.consumeFullTankLaunch?.()) {
      setTimeout(() => runFullTankSearch({ openRoute: false }), 900);
    }
  } catch { /* no es la aplicación Android */ }
}

init();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

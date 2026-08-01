import { FUEL_DEFINITIONS, extractStationArray, rankStations, equivalentSaving, mapsUrl, normalizeStationForList } from './core.js';

const API_BASE = 'https://api.precioil.es';
const STORAGE = {
  precioil: 'combusplus.precioilApiKey', maps: 'combusplus.googleMapsApiKey', mapId: 'combusplus.googleMapId',
  vehicles: 'combusplus.vehicles', selectedVehicle: 'combusplus.selectedVehicleId', favorites: 'combusplus.favoriteStations', history: 'combusplus.refuelHistory'
};

const state = {
  position: null, vehicles: [], selectedVehicleId: '', favorites: [], history: [], ranked: [], browseStations: [],
  currentSimulation: null, favoritesOnly: false, map: null, mapMarkers: [], userMarker: null, infoWindow: null, mapsPromise: null
};
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const el = {
  tabs: all('.nav-button'), panels: all('.tab-panel'), actionTiles: all('[data-target-tab]'),
  openSettings: $('#openSettings'), openSettingsTile: $('#openSettingsTile'), settingsDialog: $('#settingsDialog'),
  apiStatus: $('#apiStatus'), apiKeyInput: $('#apiKeyInput'), googleMapsKeyInput: $('#googleMapsKeyInput'), googleMapIdInput: $('#googleMapIdInput'),
  settingsError: $('#settingsError'), saveSettings: $('#saveSettings'), clearSettings: $('#clearSettings'), configureMapsButton: $('#configureMapsButton'),
  heroLocation: $('#heroLocation'), dashboardFuelLabel: $('#dashboardFuelLabel'), dashboardFuelPrice: $('#dashboardFuelPrice'), dashboardTotalSaving: $('#dashboardTotalSaving'),
  dashSavingAmount: $('#dashSavingAmount'), dashSavingText: $('#dashSavingText'), homeRefuelCount: $('#homeRefuelCount'), homeVehicleCount: $('#homeVehicleCount'),
  homeFavoriteCount: $('#homeFavoriteCount'), homeActiveVehicle: $('#homeActiveVehicle'), homeLastRecommendation: $('#homeLastRecommendation'), homeLastRefuel: $('#homeLastRefuel'),

  form: $('#calculatorForm'), vehicleSelect: $('#vehicleSelect'), consumption: $('#consumption'), fuelType: $('#fuelType'), amount: $('#amount'), radius: $('#radius'),
  locateButton: $('#locateButton'), locationTitle: $('#locationTitle'), locationText: $('#locationText'), formError: $('#formError'), calculateButton: $('#calculateButton'),
  loading: $('#loadingSection'), results: $('#resultsSection'), bestName: $('#bestName'), bestAddress: $('#bestAddress'), bestPrice: $('#bestPrice'), bestDistance: $('#bestDistance'),
  bestNetLiters: $('#bestNetLiters'), bestPurchased: $('#bestPurchased'), bestTripFuel: $('#bestTripFuel'), bestEffectivePrice: $('#bestEffectivePrice'), bestTripKm: $('#bestTripKm'),
  savingText: $('#savingText'), mapsLink: $('#mapsLink'), resultUpdated: $('#resultUpdated'), stationCount: $('#stationCount'), rankingList: $('#rankingList'), rankingTemplate: $('#rankingItemTemplate'),
  bestFavoriteButton: $('#bestFavoriteButton'), markRefueledButton: $('#markRefueledButton'), refuelConfirmation: $('#refuelConfirmation'),

  browseForm: $('#browseForm'), browseRadius: $('#browseRadius'), browseSort: $('#browseSort'), browseError: $('#browseError'), browseLoading: $('#browseLoadingSection'),
  browseSummaryTitle: $('#browseSummaryTitle'), browseSummaryText: $('#browseSummaryText'), stationBrowserList: $('#stationBrowserList'), stationBrowserItemTemplate: $('#stationBrowserItemTemplate'),
  favoritesOnlyButton: $('#favoritesOnlyButton'), googleMap: $('#googleMap'), mapStatus: $('#mapStatus'),

  vehicleForm: $('#vehicleForm'), vehicleId: $('#vehicleId'), vehicleName: $('#vehicleName'), vehiclePlate: $('#vehiclePlate'), vehicleConsumption: $('#vehicleConsumption'),
  vehicleFuel: $('#vehicleFuel'), vehiclesError: $('#vehiclesError'), saveVehicleButton: $('#saveVehicleButton'), resetVehicleForm: $('#resetVehicleForm'),
  vehicleList: $('#vehicleList'), vehicleCardTemplate: $('#vehicleCardTemplate'), vehicleCountText: $('#vehicleCountText'),

  profileTotalSaving: $('#profileTotalSaving'), profileRefuelCount: $('#profileRefuelCount'), profileTotalSpent: $('#profileTotalSpent'), profileTotalLiters: $('#profileTotalLiters'),
  refuelHistoryList: $('#refuelHistoryList'), clearHistoryButton: $('#clearHistoryButton'), profileFavoriteCount: $('#profileFavoriteCount'), favoriteStationList: $('#favoriteStationList')
};

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = (value, digits = 2) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const fuelLabel = key => FUEL_DEFINITIONS[key]?.label || key;
const readJSON = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const showError = (node, message) => { node.textContent = message; node.hidden = false; };
const clearError = node => { node.textContent = ''; node.hidden = true; };
const stationKey = station => String(station.id || `${station.name}-${station.latitude}-${station.longitude}`);

function activateTab(tab) {
  el.tabs.forEach(button => button.classList.toggle('is-active', button.dataset.tab === tab));
  el.panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tab));
  if (tab === 'profile') renderProfile();
  if (tab === 'stations' && state.browseStations.length) setTimeout(() => renderMap(filteredBrowseStations()), 80);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getPrecioilKey() { return localStorage.getItem(STORAGE.precioil)?.trim() || ''; }
function getMapsKey() { return localStorage.getItem(STORAGE.maps)?.trim() || ''; }
function getMapId() { return localStorage.getItem(STORAGE.mapId)?.trim() || 'DEMO_MAP_ID'; }

function setApiStatus() {
  const precioil = Boolean(getPrecioilKey()); const maps = Boolean(getMapsKey());
  el.apiStatus.textContent = precioil && maps ? 'APIs conectadas' : precioil ? 'Falta Google Maps' : 'API pendiente';
  el.apiStatus.classList.toggle('ready', precioil && maps);
}

function openSettings() {
  el.apiKeyInput.value = getPrecioilKey(); el.googleMapsKeyInput.value = getMapsKey(); el.googleMapIdInput.value = localStorage.getItem(STORAGE.mapId) || '';
  clearError(el.settingsError); el.settingsDialog.showModal();
}

function saveSettings() {
  const precioil = el.apiKeyInput.value.trim(); const maps = el.googleMapsKeyInput.value.trim(); const mapId = el.googleMapIdInput.value.trim();
  if (precioil && !precioil.startsWith('pk_live_') && !precioil.startsWith('sk_live_')) return showError(el.settingsError, 'La clave de Precioil debe comenzar por pk_live_ o sk_live_.');
  if (maps && !maps.startsWith('AIza')) return showError(el.settingsError, 'La clave de Google Maps no parece válida. Normalmente comienza por AIza.');
  if (precioil) localStorage.setItem(STORAGE.precioil, precioil); else localStorage.removeItem(STORAGE.precioil);
  if (maps) localStorage.setItem(STORAGE.maps, maps); else localStorage.removeItem(STORAGE.maps);
  if (mapId) localStorage.setItem(STORAGE.mapId, mapId); else localStorage.removeItem(STORAGE.mapId);
  state.mapsPromise = null; setApiStatus(); el.settingsDialog.close();
  if (maps && state.browseStations.length) renderMap(filteredBrowseStations());
}

function clearSettings() {
  [STORAGE.precioil, STORAGE.maps, STORAGE.mapId].forEach(key => localStorage.removeItem(key));
  el.apiKeyInput.value = ''; el.googleMapsKeyInput.value = ''; el.googleMapIdInput.value = ''; setApiStatus();
  showError(el.settingsError, 'Claves eliminadas de este dispositivo.');
}

function loadState() {
  state.vehicles = readJSON(STORAGE.vehicles, []); state.selectedVehicleId = localStorage.getItem(STORAGE.selectedVehicle) || '';
  state.favorites = readJSON(STORAGE.favorites, []); state.history = readJSON(STORAGE.history, []);
  if (!Array.isArray(state.vehicles)) state.vehicles = []; if (!Array.isArray(state.favorites)) state.favorites = []; if (!Array.isArray(state.history)) state.history = [];
}

function setSelectedVehicle(id) {
  state.selectedVehicleId = id || '';
  if (id) localStorage.setItem(STORAGE.selectedVehicle, id); else localStorage.removeItem(STORAGE.selectedVehicle);
  el.vehicleSelect.value = id || '';
  const vehicle = state.vehicles.find(item => item.id === id);
  if (vehicle) { el.consumption.value = vehicle.consumption; el.fuelType.value = vehicle.fuelKey; }
  updateDashboard();
}

function renderVehicleSelect() {
  el.vehicleSelect.innerHTML = '<option value="">Introducir datos manualmente</option>';
  state.vehicles.forEach(vehicle => {
    const option = document.createElement('option'); option.value = vehicle.id; option.textContent = vehicle.plate ? `${vehicle.name} · ${vehicle.plate}` : vehicle.name; el.vehicleSelect.appendChild(option);
  });
  if (state.vehicles.some(v => v.id === state.selectedVehicleId)) setSelectedVehicle(state.selectedVehicleId);
  else if (state.vehicles[0]) setSelectedVehicle(state.vehicles[0].id); else setSelectedVehicle('');
}

function resetVehicleForm() {
  el.vehicleId.value = ''; el.vehicleName.value = ''; el.vehiclePlate.value = ''; el.vehicleConsumption.value = '6.0'; el.vehicleFuel.value = 'Gasolina95';
  el.saveVehicleButton.textContent = 'Guardar vehículo'; clearError(el.vehiclesError);
}

function saveVehicle(event) {
  event.preventDefault(); clearError(el.vehiclesError);
  const vehicle = { id: el.vehicleId.value || `veh_${Date.now()}`, name: el.vehicleName.value.trim(), plate: el.vehiclePlate.value.trim(), consumption: Number(el.vehicleConsumption.value), fuelKey: el.vehicleFuel.value };
  if (!vehicle.name) return showError(el.vehiclesError, 'Escribe un nombre para el vehículo.');
  if (!Number.isFinite(vehicle.consumption) || vehicle.consumption < 1 || vehicle.consumption > 30) return showError(el.vehiclesError, 'El consumo debe estar entre 1 y 30 l/100 km.');
  const index = state.vehicles.findIndex(v => v.id === vehicle.id); if (index >= 0) state.vehicles[index] = vehicle; else state.vehicles.unshift(vehicle);
  writeJSON(STORAGE.vehicles, state.vehicles); setSelectedVehicle(vehicle.id); renderVehicleSelect(); renderVehicles(); resetVehicleForm();
}

function renderVehicles() {
  el.vehicleList.replaceChildren(); el.vehicleCountText.textContent = `${state.vehicles.length}`;
  if (!state.vehicles.length) return el.vehicleList.append(emptyState('Todavía no has añadido ningún vehículo.'));
  state.vehicles.forEach(vehicle => {
    const node = el.vehicleCardTemplate.content.cloneNode(true); const active = vehicle.id === state.selectedVehicleId;
    node.querySelector('.vehicle-card-name').textContent = vehicle.name; node.querySelector('.vehicle-card-meta').textContent = vehicle.plate || 'Sin matrícula';
    node.querySelector('.active-badge').hidden = !active;
    const stats = node.querySelector('.vehicle-card-stats'); [`${num(vehicle.consumption, 1)} l/100 km`, fuelLabel(vehicle.fuelKey)].forEach(text => { const chip = document.createElement('span'); chip.className = 'vehicle-chip'; chip.textContent = text; stats.appendChild(chip); });
    node.querySelector('.select-vehicle').addEventListener('click', () => { setSelectedVehicle(vehicle.id); renderVehicles(); activateTab('compare'); });
    node.querySelector('.edit-vehicle').addEventListener('click', () => { el.vehicleId.value = vehicle.id; el.vehicleName.value = vehicle.name; el.vehiclePlate.value = vehicle.plate || ''; el.vehicleConsumption.value = vehicle.consumption; el.vehicleFuel.value = vehicle.fuelKey; el.saveVehicleButton.textContent = 'Actualizar vehículo'; });
    node.querySelector('.delete-vehicle').addEventListener('click', () => { state.vehicles = state.vehicles.filter(v => v.id !== vehicle.id); writeJSON(STORAGE.vehicles, state.vehicles); if (active) setSelectedVehicle(state.vehicles[0]?.id || ''); renderVehicleSelect(); renderVehicles(); resetVehicleForm(); });
    el.vehicleList.appendChild(node);
  });
}

async function requestPosition() {
  if (!navigator.geolocation) throw new Error('Este navegador no permite obtener la ubicación.');
  el.locationTitle.textContent = 'Obteniendo ubicación…'; el.locationText.textContent = 'Acepta el permiso del navegador.';
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => {
    state.position = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
    const text = `GPS activo · precisión aproximada ${Math.round(position.coords.accuracy)} m`; el.locationTitle.textContent = 'Ubicación preparada'; el.locationText.textContent = text; el.heroLocation.textContent = text; resolve(state.position);
  }, error => reject(new Error(({1:'Has bloqueado el permiso de ubicación.',2:'La ubicación no está disponible.',3:'La ubicación ha tardado demasiado.'})[error.code] || 'No se pudo obtener la ubicación.')), { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }));
}

async function fetchStations({ latitude, longitude, radius }) {
  const apiKey = getPrecioilKey(); if (!apiKey) throw new Error('Configura primero la clave de Precioil.');
  const params = new URLSearchParams({ latitud: latitude.toFixed(6), longitud: longitude.toFixed(6), radio: String(radius), pagina: '1', limite: '200', fields: 'current' });
  let response; try { response = await fetch(`${API_BASE}/estaciones/radio?${params}`, { headers: { 'X-API-Key': apiKey } }); } catch { throw new Error('No se pudo conectar con Precioil desde este navegador.'); }
  let payload = null; try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('La clave de Precioil no es válida o ha caducado.');
    if (response.status === 403) throw new Error('Precioil ha rechazado la clave. Puede estar restringida por IP, dominio o tipo de uso.');
    if (response.status === 429) throw new Error('Se ha alcanzado temporalmente el límite de consultas.');
    throw new Error(payload?.message || payload?.error || `Precioil devolvió el error ${response.status}.`);
  }
  return extractStationArray(payload);
}

function readSimulationInput() {
  return { consumption: Number(el.consumption.value), amount: Number(el.amount.value), radius: Number(el.radius.value), fuelKey: el.fuelType.value, tripMode: document.querySelector('input[name="tripMode"]:checked')?.value || 'roundtrip' };
}
function validateSimulation(input) {
  if (!Number.isFinite(input.consumption) || input.consumption < 1 || input.consumption > 30) return 'Indica un consumo válido entre 1 y 30 l/100 km.';
  if (!Number.isFinite(input.amount) || input.amount < 5 || input.amount > 500) return 'Indica un importe entre 5 € y 500 €.';
  if (!Number.isFinite(input.radius) || input.radius < 1 || input.radius > 50) return 'El radio debe estar entre 1 y 50 km.';
  return '';
}

async function calculate(event) {
  event.preventDefault(); clearError(el.formError); el.refuelConfirmation.hidden = true;
  const input = readSimulationInput(); const error = validateSimulation(input); if (error) return showError(el.formError, error);
  el.calculateButton.disabled = true; el.loading.hidden = false; el.results.hidden = true;
  try {
    const position = state.position || await requestPosition(); const raw = await fetchStations({ ...position, radius: input.radius });
    const ranked = rankStations(raw, input.fuelKey, position, input); if (!ranked.length) throw new Error('No hay precios válidos para ese combustible dentro del radio indicado.');
    state.ranked = ranked; renderSimulation(ranked, input);
  } catch (errorObject) { showError(el.formError, errorObject.message || 'No se pudo completar el cálculo.'); }
  finally { el.loading.hidden = true; el.calculateButton.disabled = false; }
}

function renderSimulation(ranked, input) {
  const best = ranked[0]; const nearest = [...ranked].sort((a,b) => a.distanceKm - b.distanceKm)[0]; const saving = equivalentSaving(best, nearest);
  state.currentSimulation = { id: `sim_${Date.now()}`, best, input, saving, nearestId: nearest.id, recorded: false };
  el.bestName.textContent = best.name; el.bestAddress.textContent = best.address; el.bestPrice.textContent = `${num(best.price,3)} €/l`; el.bestDistance.textContent = `${num(best.roadDistanceKm,1)} km`; el.bestNetLiters.textContent = `${num(best.netLiters)} l`;
  el.bestPurchased.textContent = `${num(best.purchasedLiters)} l`; el.bestTripFuel.textContent = `${num(best.tripLiters)} l`; el.bestEffectivePrice.textContent = `${num(best.effectivePrice,3)} €/l`; el.bestTripKm.textContent = `${num(best.tripKm,1)} km`;
  el.savingText.textContent = saving > .01 ? `Ahorras aproximadamente ${euro.format(saving)} frente a la gasolinera más cercana.` : 'La estación más cercana ya es la opción más conveniente.';
  el.mapsLink.href = mapsUrl(best); el.resultUpdated.textContent = 'Estimación actual · el precio puede variar'; el.stationCount.textContent = `${ranked.length} opciones`; updateFavoriteButton(el.bestFavoriteButton, best);
  el.markRefueledButton.disabled = false; el.markRefueledButton.textContent = 'Marcar como REPOSTADO';
  el.rankingList.replaceChildren(); ranked.slice(0,8).forEach((station,index) => {
    const node = el.rankingTemplate.content.cloneNode(true); node.querySelector('.list-rank').textContent = index + 1; node.querySelector('.rank-name').textContent = station.name; node.querySelector('.rank-address').textContent = station.address;
    node.querySelector('.rank-distance').textContent = `${num(station.roadDistanceKm,1)} km`; node.querySelector('.rank-net').textContent = `${num(station.netLiters)} l netos`; node.querySelector('.list-price').textContent = `${num(station.price,3)} €/l`; node.querySelector('.row-link').href = mapsUrl(station); el.rankingList.appendChild(node);
  });
  el.results.hidden = false; el.dashboardFuelLabel.textContent = fuelLabel(input.fuelKey); el.dashboardFuelPrice.textContent = `${num(best.price,3)} €/l`; el.homeLastRecommendation.textContent = best.name; updateDashboard();
}

function markRefueled() {
  const simulation = state.currentSimulation; if (!simulation || simulation.recorded) return;
  const vehicle = state.vehicles.find(v => v.id === state.selectedVehicleId);
  const record = { id: `ref_${Date.now()}`, date: new Date().toISOString(), stationId: stationKey(simulation.best), stationName: simulation.best.name, address: simulation.best.address, fuelKey: simulation.input.fuelKey,
    price: simulation.best.price, amount: simulation.input.amount, liters: simulation.best.purchasedLiters, saving: simulation.saving, distanceKm: simulation.best.roadDistanceKm, vehicleId: vehicle?.id || '', vehicleName: vehicle?.name || 'Datos manuales' };
  state.history.unshift(record); writeJSON(STORAGE.history, state.history); simulation.recorded = true; el.markRefueledButton.disabled = true; el.markRefueledButton.textContent = 'REPOSTAJE GUARDADO';
  el.refuelConfirmation.textContent = `Repostaje guardado. Has añadido ${euro.format(record.saving)} a tu ahorro acumulado.`; el.refuelConfirmation.hidden = false; renderProfile(); updateDashboard();
}

function isFavorite(station) { return state.favorites.some(item => item.id === stationKey(station)); }
function compactStation(station) { return { id: stationKey(station), name: station.name, address: station.address, latitude: station.latitude, longitude: station.longitude, distanceKm: station.distanceKm, fuels: station.fuels || [], savedAt: new Date().toISOString() }; }
function toggleFavorite(station) {
  const key = stationKey(station); if (isFavorite(station)) state.favorites = state.favorites.filter(item => item.id !== key); else state.favorites.unshift(compactStation(station));
  writeJSON(STORAGE.favorites, state.favorites); updateDashboard(); renderFavorites(); if (state.currentSimulation?.best) updateFavoriteButton(el.bestFavoriteButton, state.currentSimulation.best); if (state.browseStations.length) renderStationList(filteredBrowseStations());
}
function updateFavoriteButton(button, station) { const active = isFavorite(station); button.textContent = active ? '♥' : '♡'; button.classList.toggle('is-favorite', active); button.setAttribute('aria-label', active ? 'Quitar de favoritas' : 'Añadir a favoritas'); }

function filteredBrowseStations() { const sorted = [...state.browseStations].sort(el.browseSort.value === 'name' ? (a,b) => a.name.localeCompare(b.name,'es') : (a,b) => a.distanceKm - b.distanceKm); return state.favoritesOnly ? sorted.filter(isFavorite) : sorted; }
async function browseStations(event) {
  event?.preventDefault(); clearError(el.browseError); const radius = Number(el.browseRadius.value); if (!Number.isFinite(radius) || radius < 1 || radius > 50) return showError(el.browseError, 'El radio debe estar entre 1 y 50 km.');
  el.browseLoading.hidden = false;
  try {
    const position = state.position || await requestPosition(); const raw = await fetchStations({ ...position, radius }); state.browseStations = raw.map(item => normalizeStationForList(item, position)).filter(Boolean);
    const filtered = filteredBrowseStations(); renderStationList(filtered); await renderMap(filtered); el.browseSummaryTitle.textContent = state.favoritesOnly ? 'Gasolineras favoritas' : 'Gasolineras cercanas'; el.browseSummaryText.textContent = `${filtered.length} resultados`;
  } catch (error) { showError(el.browseError, error.message || 'No se pudieron cargar las gasolineras.'); }
  finally { el.browseLoading.hidden = true; }
}

function renderStationList(stations) {
  el.stationBrowserList.replaceChildren(); if (!stations.length) return el.stationBrowserList.append(emptyState(state.favoritesOnly ? 'No tienes favoritas dentro de esta búsqueda.' : 'No se encontraron gasolineras.'));
  stations.forEach(station => {
    const node = el.stationBrowserItemTemplate.content.cloneNode(true); node.querySelector('.station-name').textContent = station.name; node.querySelector('.station-address').textContent = station.address; node.querySelector('.station-distance').textContent = `${num(station.distanceKm,1)} km desde ti`;
    const favoriteButton = node.querySelector('.station-favorite'); updateFavoriteButton(favoriteButton, station); favoriteButton.addEventListener('click', () => toggleFavorite(station));
    const fuelList = node.querySelector('.fuel-chip-list'); (station.fuels.length ? station.fuels : [{label:'Sin precios disponibles',price:null}]).forEach(fuel => { const chip = document.createElement('span'); chip.className = 'fuel-chip'; chip.textContent = fuel.price ? `${fuel.label} · ${num(fuel.price,3)} €/l` : fuel.label; fuelList.appendChild(chip); });
    node.querySelector('.route-button').href = mapsUrl(station); node.querySelector('.map-center-button').addEventListener('click', () => centerStationOnMap(station)); el.stationBrowserList.appendChild(node);
  });
}

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps); if (state.mapsPromise) return state.mapsPromise;
  const key = getMapsKey(); if (!key) return Promise.reject(new Error('Configura una clave de Google Maps para mostrar el mapa.'));
  state.mapsPromise = new Promise((resolve,reject) => {
    const callback = `combusplusMapsReady_${Date.now()}`; window[callback] = () => { delete window[callback]; resolve(window.google.maps); };
    const script = document.createElement('script'); script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker&loading=async&callback=${callback}&v=weekly`; script.async = true; script.onerror = () => { delete window[callback]; state.mapsPromise = null; reject(new Error('Google Maps no pudo cargarse. Revisa la clave, facturación y restricciones de dominio.')); }; document.head.appendChild(script);
  }); return state.mapsPromise;
}

async function renderMap(stations) {
  if (!getMapsKey()) { el.mapStatus.textContent = 'Google Maps sin configurar'; return; }
  try {
    const maps = await loadGoogleMaps(); const center = state.position ? { lat: state.position.latitude, lng: state.position.longitude } : { lat: 40.4168, lng: -3.7038 };
    if (!state.map) { state.map = new maps.Map(el.googleMap, { center, zoom: 12, mapId: getMapId(), disableDefaultUI: true, zoomControl: true, fullscreenControl: true }); state.infoWindow = new maps.InfoWindow(); }
    state.map.setCenter(center); clearMapMarkers();
    const markerLib = await maps.importLibrary('marker');
    if (state.position) {
      const pin = new markerLib.PinElement({ background:'#111214', borderColor:'#fff', glyphColor:'#fff', glyph:'●', scale:1.05 });
      state.userMarker = new markerLib.AdvancedMarkerElement({ map: state.map, position:center, content:pin.element, title:'Tu ubicación' });
    }
    const bounds = new maps.LatLngBounds(); bounds.extend(center);
    stations.forEach(station => {
      if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) return;
      const position = { lat: station.latitude, lng: station.longitude }; const pin = new markerLib.PinElement({ background:isFavorite(station)?'#e33b49':'#b70f1d', borderColor:'#fff', glyphColor:'#fff', glyph:isFavorite(station)?'♥':'€' });
      const marker = new markerLib.AdvancedMarkerElement({ map: state.map, position, content:pin.element, title:station.name }); marker.addListener('click', () => { const prices = (station.fuels||[]).slice(0,4).map(f => `<div>${escapeHtml(f.label)}: <b>${num(f.price,3)} €/l</b></div>`).join(''); state.infoWindow.setContent(`<div style="color:#17181c;max-width:230px"><strong>${escapeHtml(station.name)}</strong><p style="margin:4px 0 8px;font-size:12px">${escapeHtml(station.address)}</p>${prices}</div>`); state.infoWindow.open({ map:state.map, anchor:marker }); });
      state.mapMarkers.push(marker); bounds.extend(position);
    });
    if (stations.length) state.map.fitBounds(bounds, 55); el.mapStatus.textContent = `${stations.length} gasolineras en el mapa`;
  } catch (error) { el.mapStatus.textContent = error.message; }
}
function clearMapMarkers() { state.mapMarkers.forEach(marker => marker.map = null); state.mapMarkers = []; if (state.userMarker) { state.userMarker.map = null; state.userMarker = null; } }
function centerStationOnMap(station) { if (!state.map || !Number.isFinite(station.latitude)) return; state.map.panTo({lat:station.latitude,lng:station.longitude}); state.map.setZoom(16); el.googleMap.scrollIntoView({behavior:'smooth',block:'center'}); }
function escapeHtml(text) { return String(text ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])); }

function updateDashboard() {
  const totalSaving = state.history.reduce((sum,item) => sum + Number(item.saving || 0),0); const active = state.vehicles.find(v => v.id === state.selectedVehicleId); const latest = state.history[0];
  el.dashboardTotalSaving.textContent = euro.format(totalSaving); el.dashSavingAmount.textContent = euro.format(totalSaving); el.homeRefuelCount.textContent = state.history.length;
  el.homeVehicleCount.textContent = `${state.vehicles.length} ${state.vehicles.length === 1 ? 'guardado' : 'guardados'}`; el.homeFavoriteCount.textContent = `${state.favorites.length} ${state.favorites.length === 1 ? 'gasolinera' : 'gasolineras'}`;
  el.homeActiveVehicle.textContent = active?.name || 'Sin seleccionar'; el.homeLastRefuel.textContent = latest ? `${latest.stationName} · ${new Date(latest.date).toLocaleDateString('es-ES')}` : 'Sin actividad';
  el.dashSavingText.textContent = state.history.length ? `Has registrado ${state.history.length} repostajes con la aplicación.` : 'Registra tus repostajes para ver tu ahorro acumulado.';
}

function renderProfile() {
  const totals = state.history.reduce((acc,item) => { acc.saving += Number(item.saving||0); acc.spent += Number(item.amount||0); acc.liters += Number(item.liters||0); return acc; }, {saving:0,spent:0,liters:0});
  el.profileTotalSaving.textContent = euro.format(totals.saving); el.profileRefuelCount.textContent = state.history.length; el.profileTotalSpent.textContent = euro.format(totals.spent); el.profileTotalLiters.textContent = `${num(totals.liters,1)} l`;
  el.refuelHistoryList.replaceChildren(); if (!state.history.length) el.refuelHistoryList.append(emptyState('Cuando marques una simulación como REPOSTADO aparecerá aquí.'));
  state.history.forEach(item => {
    const article = document.createElement('article'); article.className = 'history-item'; article.innerHTML = `<div class="history-head"><strong>${escapeHtml(item.stationName)}</strong><span>${new Date(item.date).toLocaleDateString('es-ES')}</span></div><span class="station-address">${escapeHtml(item.vehicleName)} · ${escapeHtml(fuelLabel(item.fuelKey))}</span><div class="history-meta"><div><span>IMPORTE</span><strong>${euro.format(item.amount)}</strong></div><div><span>LITROS</span><strong>${num(item.liters,2)} l</strong></div><div><span>AHORRO</span><strong>${euro.format(item.saving)}</strong></div></div>`; el.refuelHistoryList.appendChild(article);
  });
  renderFavorites();
}
function renderFavorites() {
  el.profileFavoriteCount.textContent = state.favorites.length; el.favoriteStationList.replaceChildren(); if (!state.favorites.length) return el.favoriteStationList.append(emptyState('Guarda gasolineras desde el mapa o desde una recomendación.'));
  state.favorites.forEach(station => { const article = document.createElement('article'); article.className='favorite-item'; article.innerHTML=`<div class="favorite-head"><strong>${escapeHtml(station.name)}</strong><span>♥ Favorita</span></div><span class="station-address">${escapeHtml(station.address)}</span>`; const actions=document.createElement('div'); actions.className='station-actions'; actions.style.marginTop='10px'; const route=document.createElement('a'); route.className='secondary-link'; route.target='_blank'; route.rel='noopener noreferrer'; route.href=mapsUrl(station); route.textContent='Cómo llegar'; const remove=document.createElement('button'); remove.className='mini-button danger'; remove.type='button'; remove.textContent='Eliminar'; remove.addEventListener('click',()=>toggleFavorite(station)); actions.append(route,remove); article.appendChild(actions); el.favoriteStationList.appendChild(article); });
}
function emptyState(message) { const div=document.createElement('div'); div.className='empty-state'; div.textContent=message; return div; }

function boot() {
  loadState(); renderVehicleSelect(); renderVehicles(); resetVehicleForm(); setApiStatus(); updateDashboard(); renderProfile(); activateTab('home');
  if (!getPrecioilKey()) setTimeout(openSettings,300);
}

el.tabs.forEach(button => button.addEventListener('click',()=>activateTab(button.dataset.tab)));
el.actionTiles.forEach(button => button.addEventListener('click',()=>{ if(button.dataset.focusFavorites==='true'){state.favoritesOnly=true;el.favoritesOnlyButton.classList.add('is-active');} activateTab(button.dataset.targetTab); }));
el.openSettings.addEventListener('click',openSettings); el.openSettingsTile.addEventListener('click',openSettings); el.configureMapsButton.addEventListener('click',openSettings);
el.saveSettings.addEventListener('click',saveSettings); el.clearSettings.addEventListener('click',clearSettings);
el.form.addEventListener('submit',calculate); el.locateButton.addEventListener('click',async()=>{clearError(el.formError);try{await requestPosition();}catch(error){showError(el.formError,error.message);}});
el.bestFavoriteButton.addEventListener('click',()=>state.currentSimulation?.best&&toggleFavorite(state.currentSimulation.best)); el.markRefueledButton.addEventListener('click',markRefueled);
el.browseForm.addEventListener('submit',browseStations); el.browseSort.addEventListener('change',()=>{const stations=filteredBrowseStations();renderStationList(stations);renderMap(stations);});
el.favoritesOnlyButton.addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;el.favoritesOnlyButton.classList.toggle('is-active',state.favoritesOnly);const stations=filteredBrowseStations();renderStationList(stations);renderMap(stations);el.browseSummaryText.textContent=`${stations.length} resultados`;});
el.vehicleForm.addEventListener('submit',saveVehicle); el.resetVehicleForm.addEventListener('click',resetVehicleForm); el.vehicleSelect.addEventListener('change',()=>setSelectedVehicle(el.vehicleSelect.value));
el.clearHistoryButton.addEventListener('click',()=>{if(!state.history.length)return;if(confirm('¿Quieres borrar todo el historial de repostajes?')){state.history=[];writeJSON(STORAGE.history,state.history);renderProfile();updateDashboard();}});

boot();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

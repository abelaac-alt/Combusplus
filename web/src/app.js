import {
  FUEL_DEFINITIONS, extractStationArray, normalizeStationForList, personalPrice,
  discountForStation, rankNormalizedStations, equivalentSaving, mapsUrl,
  averagePrice, priceRange
} from './core.js';

const STORAGE={
  settings:'combusplus.v5.settings',vehicles:'combusplus.v5.vehicles',selectedVehicle:'combusplus.v5.selectedVehicle',
  favorites:'combusplus.v5.favorites',discounts:'combusplus.v5.discounts',history:'combusplus.v5.history',
  snapshots:'combusplus.v5.snapshots',filters:'combusplus.v5.filters'
};
const DEFAULT_SETTINGS={apiMode:'proxy',proxyUrl:'',proxyToken:'',precioilKey:'',googleMapsKey:'',googleMapId:'',notificationsEnabled:false,notificationInterval:6,notificationThreshold:.001,notificationDirection:'both'};
const DEFAULT_FILTERS={fuelKey:'Diesel',radius:10,sort:'effective',openFilter:'all',mapMode:'all',priceDisplay:'liter'};
const state={settings:{...DEFAULT_SETTINGS},filters:{...DEFAULT_FILTERS},vehicles:[],selectedVehicleId:'',favorites:[],discounts:[],history:[],snapshots:{},position:null,stations:[],currentStation:null,currentSimulation:null,map:null,markers:[],mapsPromise:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const el={
  pages:$$('.page'),nav:$$('[data-nav]'),headerVehicleSelect:$('#headerVehicleSelect'),openSimulation:$('#openSimulation'),openSettings:$('#openSettings'),openFilters:$('#openFilters'),
  listFuel:$('#listFuel'),listRadius:$('#listRadius'),listSort:$('#listSort'),searchStations:$('#searchStations'),locationStatus:$('#locationStatus'),listSummary:$('#listSummary'),stationList:$('#stationList'),
  refreshMap:$('#refreshMap'),mapModeLabel:$('#mapModeLabel'),mapTopTenToggle:$('#mapTopTenToggle'),googleMap:$('#googleMap'),configureMap:$('#configureMap'),mapPreviewList:$('#mapPreviewList'),
  favoriteCount:$('#favoriteCount'),favoriteNavBadge:$('#favoriteNavBadge'),globalNotificationsToggle:$('#globalNotificationsToggle'),favoriteList:$('#favoriteList'),
  statSaving:$('#statSaving'),statRefuels:$('#statRefuels'),statAmount:$('#statAmount'),statLiters:$('#statLiters'),exportData:$('#exportData'),clearHistory:$('#clearHistory'),refuelHistory:$('#refuelHistory'),
  newVehicle:$('#newVehicle'),vehicleList:$('#vehicleList'),newDiscount:$('#newDiscount'),discountList:$('#discountList'),
  stationDialog:$('#stationDialog'),detailBrand:$('#detailBrand'),detailName:$('#detailName'),detailAddress:$('#detailAddress'),detailFuelTable:$('#detailFuelTable'),detailOpen:$('#detailOpen'),detailHours:$('#detailHours'),detailDistance:$('#detailDistance'),detailSelectedPrice:$('#detailSelectedPrice'),detailAverageText:$('#detailAverageText'),detailScaleMarker:$('#detailScaleMarker'),detailScaleMin:$('#detailScaleMin'),detailScaleMax:$('#detailScaleMax'),priceHistoryChart:$('#priceHistoryChart'),detailTrend:$('#detailTrend'),detailAlert:$('#detailAlert'),detailFavorite:$('#detailFavorite'),detailRoute:$('#detailRoute'),detailSimulate:$('#detailSimulate'),
  filtersDialog:$('#filtersDialog'),filtersForm:$('#filtersForm'),applyFilters:$('#applyFilters'),simulationDialog:$('#simulationDialog'),simulationForm:$('#simulationForm'),simVehicle:$('#simVehicle'),simConsumption:$('#simConsumption'),simFuel:$('#simFuel'),simAmount:$('#simAmount'),simRadius:$('#simRadius'),simulationError:$('#simulationError'),simulationResult:$('#simulationResult'),simBestName:$('#simBestName'),simBestAddress:$('#simBestAddress'),simBestPrice:$('#simBestPrice'),simBestDistance:$('#simBestDistance'),simSaving:$('#simSaving'),markRefueled:$('#markRefueled'),
  vehicleDialog:$('#vehicleDialog'),vehicleForm:$('#vehicleForm'),vehicleDialogTitle:$('#vehicleDialogTitle'),vehicleId:$('#vehicleId'),vehicleName:$('#vehicleName'),vehiclePlate:$('#vehiclePlate'),vehicleTank:$('#vehicleTank'),vehicleConsumption:$('#vehicleConsumption'),vehicleFuel:$('#vehicleFuel'),vehicleError:$('#vehicleError'),
  discountDialog:$('#discountDialog'),discountForm:$('#discountForm'),discountDialogTitle:$('#discountDialogTitle'),discountId:$('#discountId'),discountName:$('#discountName'),discountStation:$('#discountStation'),discountFuel:$('#discountFuel'),discountType:$('#discountType'),discountValue:$('#discountValue'),discountError:$('#discountError'),
  settingsDialog:$('#settingsDialog'),settingsForm:$('#settingsForm'),proxyUrl:$('#proxyUrl'),proxyToken:$('#proxyToken'),precioilKey:$('#precioilKey'),googleMapsKey:$('#googleMapsKey'),googleMapId:$('#googleMapId'),notificationsEnabled:$('#notificationsEnabled'),notificationInterval:$('#notificationInterval'),notificationThreshold:$('#notificationThreshold'),notificationDirection:$('#notificationDirection'),requestNotifications:$('#requestNotifications'),settingsError:$('#settingsError'),
  stationCardTemplate:$('#stationCardTemplate'),favoriteCardTemplate:$('#favoriteCardTemplate')
};
const euro=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'});
const num=(v,d=3)=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const nowIso=()=>new Date().toISOString();

function readJSON(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value))}
function uid(prefix='id'){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function toast(message){const old=$('.toast');if(old)old.remove();const node=document.createElement('div');node.className='toast';node.textContent=message;document.body.appendChild(node);setTimeout(()=>node.remove(),2600)}
function showError(node,message){node.textContent=message;node.hidden=false}
function clearError(node){node.hidden=true;node.textContent=''}
function fuelLabel(key){return FUEL_DEFINITIONS[key]?.label||key}
function activeVehicle(){return state.vehicles.find(v=>v.id===state.selectedVehicleId)||null}
function favoriteById(id){return state.favorites.find(f=>String(f.id)===String(id))}
function isFavorite(id){return Boolean(favoriteById(id))}
function isNative(){try{return Boolean(window.AndroidBridge?.isNativeApp?.())}catch{return false}}

function loadState(){
  state.settings={...DEFAULT_SETTINGS,...readJSON(STORAGE.settings,{})};
  state.filters={...DEFAULT_FILTERS,...readJSON(STORAGE.filters,{})};
  state.vehicles=readJSON(STORAGE.vehicles,[]);state.selectedVehicleId=localStorage.getItem(STORAGE.selectedVehicle)||'';
  state.favorites=readJSON(STORAGE.favorites,[]);state.discounts=readJSON(STORAGE.discounts,[]);state.history=readJSON(STORAGE.history,[]);state.snapshots=readJSON(STORAGE.snapshots,{});
  if(!state.vehicles.some(v=>v.id===state.selectedVehicleId))state.selectedVehicleId=state.vehicles[0]?.id||'';
}
function saveSettings(){writeJSON(STORAGE.settings,state.settings);syncNativeConfig()}
function saveFavorites(){writeJSON(STORAGE.favorites,state.favorites);renderFavorites();renderStations();renderMapPreview();syncNativeConfig()}
function saveSnapshots(){writeJSON(STORAGE.snapshots,state.snapshots)}
function saveVehicles(){writeJSON(STORAGE.vehicles,state.vehicles);if(state.selectedVehicleId)localStorage.setItem(STORAGE.selectedVehicle,state.selectedVehicleId);else localStorage.removeItem(STORAGE.selectedVehicle);renderVehicleSelectors();renderVehicles()}
function saveDiscounts(){writeJSON(STORAGE.discounts,state.discounts);renderDiscounts();renderStations()}
function saveHistory(){writeJSON(STORAGE.history,state.history);renderStats()}
function saveFilters(){writeJSON(STORAGE.filters,state.filters)}

function fillFuelSelect(select,includeAll=false){select.innerHTML=includeAll?'<option value="all">Todos los combustibles</option>':'';for(const [key,def] of Object.entries(FUEL_DEFINITIONS)){const o=document.createElement('option');o.value=key;o.textContent=def.label;select.appendChild(o)}}
function renderVehicleSelectors(){
  const selects=[el.headerVehicleSelect,el.simVehicle];for(const select of selects){const manual=select===el.simVehicle;select.innerHTML=manual?'<option value="">Datos manuales</option>':'<option value="">Sin vehículo</option>';for(const v of state.vehicles){const o=document.createElement('option');o.value=v.id;o.textContent=v.plate?`${v.name} · ${v.plate}`:v.name;select.appendChild(o)}select.value=state.selectedVehicleId||''}
  const v=activeVehicle();if(v){el.simConsumption.value=v.consumption;el.simFuel.value=v.fuelKey;el.listFuel.value=state.filters.fuelKey||v.fuelKey}
}
function setActiveVehicle(id){state.selectedVehicleId=id;saveVehicles();const v=activeVehicle();if(v){state.filters.fuelKey=v.fuelKey;el.listFuel.value=v.fuelKey;el.simFuel.value=v.fuelKey;el.simConsumption.value=v.consumption;saveFilters()}syncNativeConfig()}

function navigate(page){if(!['list','map','favorites','stats'].includes(page))page='list';if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`);el.pages.forEach(p=>p.classList.toggle('is-active',p.dataset.page===page));$$('.nav-item').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===page));if(page==='map')renderMap();if(page==='favorites')renderFavorites();if(page==='stats')renderStats();window.scrollTo({top:0,behavior:'smooth'})}
function openDialog(dialog){if(!dialog.open)dialog.showModal()}
function closeDialog(dialog){if(dialog.open)dialog.close()}

function apiEndpoint(path,params){
  if(state.settings.apiMode==='proxy'){
    if(!state.settings.proxyUrl)throw new Error('Configura la URL del servidor seguro.');
    return `${state.settings.proxyUrl.replace(/\/$/,'')}${path}?${params}`;
  }
  if(!state.settings.precioilKey)throw new Error('Configura la clave de Precioil.');
  return `https://api.precioil.es${path}?${params}`;
}
async function apiFetch(path,params){
  const url=apiEndpoint(path,params);const headers={};
  if(state.settings.apiMode==='direct')headers['X-API-Key']=state.settings.precioilKey;
  else if(state.settings.proxyToken)headers['X-Combusplus-Client']=state.settings.proxyToken;
  let response;try{response=await fetch(url,{headers})}catch{throw new Error('No se pudo conectar con el servicio de precios.')}
  let payload=null;try{payload=await response.json()}catch{}
  if(!response.ok)throw new Error(payload?.message||payload?.error||`Error ${response.status} al consultar precios.`);
  return payload;
}
async function requestPosition(){
  if(!navigator.geolocation)throw new Error('Este dispositivo no permite obtener la ubicación.');
  el.locationStatus.textContent='Obteniendo ubicación…';
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:120000}));
  state.position={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};
  el.locationStatus.textContent=`Ubicación activa · precisión ${Math.round(position.coords.accuracy)} m`;return state.position;
}
async function fetchStations(radius=state.filters.radius){
  const pos=state.position||await requestPosition();
  const params=new URLSearchParams({latitud:pos.latitude.toFixed(6),longitud:pos.longitude.toFixed(6),radio:String(radius),pagina:'1',limite:'250',fields:'current'});
  const payload=await apiFetch('/estaciones/radio',params);const raw=extractStationArray(payload);
  state.stations=raw.map(r=>normalizeStationForList(r,pos)).filter(Boolean);recordSnapshots(state.stations);return state.stations;
}

function stationPrice(station,fuelKey=state.filters.fuelKey){return personalPrice(station,fuelKey,state.discounts)}
function stationBasePrice(station,fuelKey=state.filters.fuelKey){return station.fuels.find(f=>f.key===fuelKey)?.price||null}
function displayPrice(station,fuelKey=state.filters.fuelKey){const price=stationPrice(station,fuelKey);if(!price)return 'Sin precio';if(state.filters.priceDisplay==='tank'){const tank=activeVehicle()?.tank||50;return euro.format(price*tank)}return `${num(price)} €/l`}
function filteredStations(){
  let items=state.stations.filter(s=>stationPrice(s));if(state.filters.openFilter==='open')items=items.filter(s=>s.isOpen===true);
  const fuelKey=state.filters.fuelKey;
  items.sort((a,b)=>{
    if(state.filters.sort==='distance')return a.distanceKm-b.distanceKm;
    if(state.filters.sort==='name')return a.name.localeCompare(b.name,'es');
    if(state.filters.sort==='price')return (stationBasePrice(a,fuelKey)||99)-(stationBasePrice(b,fuelKey)||99);
    return (stationPrice(a,fuelKey)||99)-(stationPrice(b,fuelKey)||99);
  });return items;
}
async function searchStations(){
  el.stationList.innerHTML='<div class="loading">Buscando gasolineras…</div>';state.filters.fuelKey=el.listFuel.value;state.filters.radius=Number(el.listRadius.value);state.filters.sort=el.listSort.value;saveFilters();
  try{await fetchStations(state.filters.radius);renderStations();renderMapPreview();await checkFavoritePrices(false)}catch(error){el.stationList.innerHTML='';el.stationList.appendChild(emptyState(error.message));}
}
function renderStations(){
  const items=filteredStations();el.stationList.replaceChildren();el.listSummary.textContent=`${items.length} resultados`;
  if(!items.length){el.stationList.appendChild(emptyState(state.stations.length?'No hay resultados con estos filtros.':'Pulsa Buscar para cargar gasolineras.'));return}
  for(const station of items){
    const node=el.stationCardTemplate.content.cloneNode(true);const card=node.querySelector('.station-card');const main=node.querySelector('.station-main');
    node.querySelector('.station-name').textContent=station.name;node.querySelector('.station-address').textContent=station.address;
    const open=node.querySelector('.station-open');open.textContent=station.isOpen===true?'ABIERTA':station.isOpen===false?'CERRADA':'ESTADO N/D';open.classList.toggle('closed',station.isOpen===false);
    node.querySelector('.station-fuel-label').textContent=fuelLabel(state.filters.fuelKey);node.querySelector('.station-price').textContent=displayPrice(station);
    const discount=discountForStation(station,state.filters.fuelKey,state.discounts);node.querySelector('.station-discount').textContent=discount?`Descuento aplicado: −${num(discount)} €/l`:'';
    node.querySelector('.station-distance').textContent=`${num(station.distanceKm,1)} km`;node.querySelector('.station-hours').textContent=station.schedule;
    main.addEventListener('click',()=>openStationDetail(station));
    const fav=node.querySelector('.favorite-btn');fav.textContent=isFavorite(station.id)?'★':'☆';fav.classList.toggle('is-favorite',isFavorite(station.id));fav.addEventListener('click',()=>toggleFavorite(station));
    node.querySelector('.simulate-btn').addEventListener('click',()=>openSimulationFor(station));node.querySelector('.route-btn').href=mapsUrl(station);el.stationList.appendChild(node);
  }
}
function emptyState(message){const div=document.createElement('div');div.className='empty-state';div.innerHTML=`<strong>Sin datos</strong><p>${escapeHtml(message)}</p>`;return div}

function toggleFavorite(station){
  const existing=favoriteById(station.id);if(existing){state.favorites=state.favorites.filter(f=>String(f.id)!==String(station.id));toast('Eliminada de favoritas')}else{state.favorites.push({id:station.id,name:station.name,address:station.address,brand:station.brand,latitude:station.latitude,longitude:station.longitude,distanceKm:station.distanceKm,watchFuel:state.filters.fuelKey,notifications:true,lastPrice:stationBasePrice(station,state.filters.fuelKey),lastChecked:nowIso()});toast('Añadida a favoritas')}
  saveFavorites();if(state.currentStation?.id===station.id)updateDetailFavoriteButtons();
}
function renderFavorites(){
  el.favoriteList.replaceChildren();el.favoriteCount.textContent=state.favorites.length;el.favoriteNavBadge.textContent=state.favorites.length;el.favoriteNavBadge.hidden=!state.favorites.length;
  el.globalNotificationsToggle.textContent=state.settings.notificationsEnabled?'Activados':'Desactivados';el.globalNotificationsToggle.setAttribute('aria-pressed',String(state.settings.notificationsEnabled));
  if(!state.favorites.length){el.favoriteList.appendChild(emptyState('Añade una estación desde la lista o el mapa.'));return}
  for(const favorite of state.favorites){
    const node=el.favoriteCardTemplate.content.cloneNode(true);node.querySelector('.favorite-name').textContent=favorite.name;node.querySelector('.favorite-address').textContent=favorite.address;
    const fuel=node.querySelector('.favorite-fuel');fillFuelSelect(fuel);fuel.value=favorite.watchFuel||state.filters.fuelKey;fuel.addEventListener('change',()=>{favorite.watchFuel=fuel.value;favorite.lastPrice=null;saveFavorites()});
    const alert=node.querySelector('.favorite-alert');alert.checked=favorite.notifications!==false;alert.addEventListener('change',()=>{favorite.notifications=alert.checked;saveFavorites()});
    node.querySelector('.favorite-current-price').textContent=favorite.lastPrice?`${num(favorite.lastPrice)} €/l`:'Pendiente';const change=node.querySelector('.favorite-change');
    if(Number.isFinite(favorite.lastChange)&&favorite.lastChange!==0){change.textContent=`${favorite.lastChange>0?'+':''}${num(favorite.lastChange)} €/l`;change.className=`favorite-change ${favorite.lastChange>0?'up':'down'}`}else change.textContent=favorite.lastChecked?`Comprobada ${new Date(favorite.lastChecked).toLocaleString('es-ES')}`:'Sin comprobar';
    node.querySelector('.favorite-open').addEventListener('click',()=>{const station=state.stations.find(s=>String(s.id)===String(favorite.id))||favorite;openStationDetail(station)});
    node.querySelector('.favorite-remove').addEventListener('click',()=>toggleFavorite(favorite));el.favoriteList.appendChild(node);
  }
}

function recordSnapshots(stations){
  const ts=Date.now();for(const station of stations){for(const fuel of station.fuels){const key=`${station.id}:${fuel.key}`;const arr=state.snapshots[key]||[];const last=arr[arr.length-1];if(!last||Math.abs(last.price-fuel.price)>.0005||ts-last.ts>60*60*1000)arr.push({ts,price:fuel.price});state.snapshots[key]=arr.filter(p=>ts-p.ts<30*24*60*60*1000).slice(-240)}}saveSnapshots();
}
function snapshotHistory(stationId,fuelKey){return (state.snapshots[`${stationId}:${fuelKey}`]||[]).filter(p=>Date.now()-p.ts<24*60*60*1000)}
async function checkFavoritePrices(notify=true){
  if(!state.favorites.length)return;let changed=false;
  for(const favorite of state.favorites){
    if(!favorite.latitude||!favorite.longitude)continue;
    try{
      const params=new URLSearchParams({latitud:Number(favorite.latitude).toFixed(6),longitud:Number(favorite.longitude).toFixed(6),radio:'1',pagina:'1',limite:'50',fields:'current'});
      const stations=extractStationArray(await apiFetch('/estaciones/radio',params)).map(r=>normalizeStationForList(r,{latitude:favorite.latitude,longitude:favorite.longitude})).filter(Boolean);
      const station=stations.find(s=>String(s.id)===String(favorite.id))||stations.find(s=>s.name.toLowerCase()===favorite.name.toLowerCase())||stations[0];if(!station)continue;
      const price=stationBasePrice(station,favorite.watchFuel);if(!price)continue;const previous=Number(favorite.lastPrice);favorite.lastPrice=price;favorite.lastChecked=nowIso();favorite.lastChange=Number.isFinite(previous)?price-previous:0;changed=true;recordSnapshots([station]);
      if(notify&&Number.isFinite(previous)&&shouldNotify(favorite.lastChange)&&favorite.notifications!==false&&state.settings.notificationsEnabled)await showPriceNotification(favorite,previous,price);
    }catch{}
  }
  if(changed)saveFavorites();
}
function shouldNotify(change){const threshold=Number(state.settings.notificationThreshold)||.001;if(Math.abs(change)<threshold)return false;if(state.settings.notificationDirection==='down')return change<0;if(state.settings.notificationDirection==='up')return change>0;return true}
async function showPriceNotification(favorite,oldPrice,newPrice){
  const direction=newPrice<oldPrice?'ha bajado':'ha subido';const title=`El ${fuelLabel(favorite.watchFuel)} ${direction}`;const body=`${favorite.name}: de ${num(oldPrice)} a ${num(newPrice)} €/l`;
  if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.ready;if(Notification.permission==='granted')await registration.showNotification(title,{body,icon:'./assets/icon.svg',badge:'./assets/icon.svg',tag:`price-${favorite.id}-${favorite.watchFuel}`,data:{url:'./#favorites'}})}
}

function openStationDetail(station){
  state.currentStation=station;const fuelKey=state.filters.fuelKey;el.detailBrand.textContent=station.brand||'GASOLINERA';el.detailName.textContent=station.name;el.detailAddress.textContent=station.address;
  el.detailFuelTable.replaceChildren();for(const fuel of station.fuels||[]){const row=document.createElement('div');row.className=`detail-fuel-row ${fuel.key===fuelKey?'is-selected':''}`;const p=personalPrice(station,fuel.key,state.discounts);row.innerHTML=`<strong>${escapeHtml(fuel.label)}</strong><b>${num(p)} €</b>`;row.addEventListener('click',()=>{state.filters.fuelKey=fuel.key;el.listFuel.value=fuel.key;saveFilters();openStationDetail(station)});el.detailFuelTable.appendChild(row)}
  el.detailOpen.textContent=station.isOpen===true?'ABIERTA':station.isOpen===false?'CERRADA':'ESTADO N/D';el.detailHours.textContent=station.schedule||'Horario no disponible';el.detailDistance.textContent=`${num(station.distanceKm||0,1)} km`;
  const price=stationPrice(station,fuelKey),avg=averagePrice(state.stations,fuelKey,state.discounts),range=priceRange(state.stations,fuelKey,state.discounts);el.detailSelectedPrice.textContent=price?`${num(price)} €`:'—';el.detailAverageText.textContent=avg?`· media ${num(avg)} €`:'';
  if(range&&price){const span=Math.max(.001,range.max-range.min),pct=Math.max(0,Math.min(100,(price-range.min)/span*100));el.detailScaleMarker.style.left=`${pct}%`;el.detailScaleMin.textContent=`${num(range.min)} €`;el.detailScaleMax.textContent=`${num(range.max)} €`}else{el.detailScaleMarker.style.left='50%';el.detailScaleMin.textContent='—';el.detailScaleMax.textContent='—'}
  renderHistoryChart(snapshotHistory(station.id,fuelKey));el.detailRoute.href=mapsUrl(station);updateDetailFavoriteButtons();openDialog(el.stationDialog);
}
function updateDetailFavoriteButtons(){const favorite=state.currentStation&&isFavorite(state.currentStation.id);el.detailFavorite.classList.toggle('is-active',favorite);el.detailFavorite.querySelector('span').textContent=favorite?'★':'☆';el.detailAlert.classList.toggle('is-active',favoriteById(state.currentStation?.id)?.notifications===true)}
function renderHistoryChart(points){
  el.priceHistoryChart.replaceChildren();if(points.length<2){el.detailTrend.textContent='Aún no hay suficientes datos';const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','280');text.setAttribute('y','84');text.setAttribute('text-anchor','middle');text.setAttribute('fill','#cdd3df');text.textContent='El historial se crea con las comprobaciones de precio';el.priceHistoryChart.appendChild(text);return}
  const min=Math.min(...points.map(p=>p.price)),max=Math.max(...points.map(p=>p.price)),span=Math.max(.001,max-min);const first=points[0].ts,last=points.at(-1).ts,timeSpan=Math.max(1,last-first);const coords=points.map(p=>`${20+(p.ts-first)/timeSpan*520},${140-(p.price-min)/span*110}`).join(' ');
  const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',coords);line.setAttribute('fill','none');line.setAttribute('stroke','#fff');line.setAttribute('stroke-width','5');line.setAttribute('stroke-linejoin','round');el.priceHistoryChart.appendChild(line);
  const change=points.at(-1).price-points[0].price;el.detailTrend.textContent=Math.abs(change)<.0005?'Precio estable':`Tendencia ${change>0?'subiendo':'bajando'} ${change>0?'↗':'↘'}`;
}

function mapStations(){let items=filteredStations();if(state.filters.mapMode==='top10'||el.mapTopTenToggle.getAttribute('aria-pressed')==='true')items=[...items].sort((a,b)=>stationPrice(a)-stationPrice(b)).slice(0,10);return items}
function loadGoogleMaps(){
  if(window.google?.maps)return Promise.resolve(window.google.maps);if(state.mapsPromise)return state.mapsPromise;if(!state.settings.googleMapsKey)return Promise.reject(new Error('Configura la clave de Google Maps.'));
  state.mapsPromise=new Promise((resolve,reject)=>{const callback=`cb_${Date.now()}`;window[callback]=()=>{delete window[callback];resolve(window.google.maps)};const script=document.createElement('script');script.async=true;script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.settings.googleMapsKey)}&loading=async&callback=${callback}&language=es&region=ES${state.settings.googleMapId?`&map_ids=${encodeURIComponent(state.settings.googleMapId)}`:''}`;script.onerror=()=>reject(new Error('No se pudo cargar Google Maps.'));document.head.appendChild(script)});return state.mapsPromise;
}
async function renderMap(){
  if(!state.stations.length){el.googleMap.innerHTML='';el.googleMap.appendChild(emptyState('Realiza una búsqueda desde la pestaña Lista.'));return}
  try{const maps=await loadGoogleMaps();const center=state.position?{lat:state.position.latitude,lng:state.position.longitude}:{lat:40.4168,lng:-3.7038};if(!state.map)state.map=new maps.Map(el.googleMap,{center,zoom:12,mapId:state.settings.googleMapId||undefined,streetViewControl:false,mapTypeControl:false,fullscreenControl:true});state.map.setCenter(center);state.markers.forEach(m=>m.setMap(null));state.markers=[];
    const items=mapStations();for(const station of items){if(!Number.isFinite(station.latitude)||!Number.isFinite(station.longitude))continue;const marker=new maps.Marker({position:{lat:station.latitude,lng:station.longitude},map:state.map,title:station.name,label:{text:num(stationPrice(station),2),color:'#fff',fontWeight:'700'},icon:{path:maps.SymbolPath.CIRCLE,scale:16,fillColor:isFavorite(station.id)?'#dca000':'#b3131b',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});marker.addListener('click',()=>openStationDetail(station));state.markers.push(marker)}el.mapModeLabel.textContent=items.length===10&&state.filters.mapMode==='top10'?'10 más baratas':`${items.length} gasolineras`;renderMapPreview();
  }catch(error){el.googleMap.innerHTML='';el.googleMap.appendChild(emptyState(error.message))}
}
function renderMapPreview(){const items=mapStations().slice(0,6);el.mapPreviewList.replaceChildren();for(const station of items){const article=document.createElement('article');article.className='station-card';article.style.display='block';article.innerHTML=`<button class="station-main" type="button"><strong class="station-name">${escapeHtml(station.name)}</strong><span class="station-address">${escapeHtml(station.address)}</span><div class="station-price-row"><strong class="station-price">${escapeHtml(displayPrice(station))}</strong><span>${num(station.distanceKm,1)} km</span></div></button>`;article.querySelector('button').addEventListener('click',()=>openStationDetail(station));el.mapPreviewList.appendChild(article)}}

function openSimulationFor(station=null){clearError(el.simulationError);el.simulationResult.hidden=true;const v=activeVehicle();el.simVehicle.value=v?.id||'';if(v){el.simConsumption.value=v.consumption;el.simFuel.value=v.fuelKey}if(station){state.currentStation=station;el.simRadius.value=Math.max(1,Math.ceil(station.distanceKm+1))}openDialog(el.simulationDialog)}
async function runSimulation(event){event.preventDefault();clearError(el.simulationError);const input={fuelKey:el.simFuel.value,discounts:state.discounts,consumption:Number(el.simConsumption.value),amount:Number(el.simAmount.value),tripMode:$('input[name="simTrip"]:checked')?.value||'roundtrip'};const radius=Number(el.simRadius.value);if(!Number.isFinite(input.consumption)||input.consumption<1||input.consumption>30)return showError(el.simulationError,'Consumo no válido.');if(!Number.isFinite(input.amount)||input.amount<5)return showError(el.simulationError,'Importe no válido.');
  try{if(!state.stations.length||radius>state.filters.radius)await fetchStations(radius);const ranked=rankNormalizedStations(state.stations,input);if(!ranked.length)throw new Error('No hay estaciones con precio para ese combustible.');const best=ranked[0],nearest=[...ranked].sort((a,b)=>a.distanceKm-b.distanceKm)[0],saving=equivalentSaving(best,nearest);state.currentSimulation={best,nearest,saving,input,radius,vehicleId:el.simVehicle.value};el.simBestName.textContent=best.name;el.simBestAddress.textContent=best.address;el.simBestPrice.textContent=`${num(best.price)} €/l`;el.simBestDistance.textContent=`${num(best.roadDistanceKm,1)} km`;el.simSaving.textContent=euro.format(saving);el.simulationResult.hidden=false;}catch(error){showError(el.simulationError,error.message)}}
function markRefueled(){const sim=state.currentSimulation;if(!sim)return;const item={id:uid('refuel'),date:nowIso(),stationId:sim.best.id,stationName:sim.best.name,address:sim.best.address,vehicleId:sim.vehicleId||state.selectedVehicleId,vehicleName:state.vehicles.find(v=>v.id===(sim.vehicleId||state.selectedVehicleId))?.name||'Datos manuales',fuelKey:sim.input.fuelKey,price:sim.best.price,amount:sim.input.amount,liters:sim.best.purchasedLiters,distanceKm:sim.best.roadDistanceKm,saving:sim.saving};state.history.unshift(item);saveHistory();toast('Repostaje registrado');closeDialog(el.simulationDialog);navigate('stats')}

function renderStats(){
  const totalSaving=state.history.reduce((s,x)=>s+(Number(x.saving)||0),0),totalAmount=state.history.reduce((s,x)=>s+(Number(x.amount)||0),0),totalLiters=state.history.reduce((s,x)=>s+(Number(x.liters)||0),0);el.statSaving.textContent=euro.format(totalSaving);el.statRefuels.textContent=state.history.length;el.statAmount.textContent=euro.format(totalAmount);el.statLiters.textContent=`${num(totalLiters,2)} l`;
  el.refuelHistory.replaceChildren();if(!state.history.length)el.refuelHistory.appendChild(emptyState('Marca una simulación como REPOSTADO para crear el historial.'));for(const item of state.history){const node=document.createElement('article');node.className='history-item';node.innerHTML=`<div><strong>${escapeHtml(item.stationName)}</strong><span>${new Date(item.date).toLocaleString('es-ES')} · ${escapeHtml(fuelLabel(item.fuelKey))} · ${euro.format(item.amount)}</span><span>Ahorro estimado: ${euro.format(item.saving||0)} · ${num(item.liters,2)} l</span></div><div class="row-actions"><button class="danger" type="button">Eliminar</button></div>`;node.querySelector('button').addEventListener('click',()=>{state.history=state.history.filter(x=>x.id!==item.id);saveHistory()});el.refuelHistory.appendChild(node)}
  renderVehicles();renderDiscounts();
}
function renderVehicles(){el.vehicleList.replaceChildren();if(!state.vehicles.length){el.vehicleList.appendChild(emptyState('Añade un vehículo para guardar consumo, combustible y capacidad del depósito.'));return}for(const v of state.vehicles){const node=document.createElement('article');node.className='vehicle-item';node.innerHTML=`<div><strong>${escapeHtml(v.name)}${v.id===state.selectedVehicleId?' · ACTIVO':''}</strong><span>${escapeHtml(v.plate||'Sin matrícula')} · ${fuelLabel(v.fuelKey)} · ${num(v.consumption,1)} l/100 km · depósito ${num(v.tank||50,0)} l</span></div><div class="row-actions"><button class="use" type="button">Usar</button><button class="edit" type="button">Editar</button><button class="danger delete" type="button">Eliminar</button></div>`;node.querySelector('.use').addEventListener('click',()=>setActiveVehicle(v.id));node.querySelector('.edit').addEventListener('click',()=>openVehicleDialog(v));node.querySelector('.delete').addEventListener('click',()=>{state.vehicles=state.vehicles.filter(x=>x.id!==v.id);if(state.selectedVehicleId===v.id)state.selectedVehicleId=state.vehicles[0]?.id||'';saveVehicles()});el.vehicleList.appendChild(node)}}
function openVehicleDialog(vehicle=null){el.vehicleForm.reset();clearError(el.vehicleError);el.vehicleId.value=vehicle?.id||'';el.vehicleDialogTitle.textContent=vehicle?'Editar vehículo':'Añadir vehículo';el.vehicleName.value=vehicle?.name||'';el.vehiclePlate.value=vehicle?.plate||'';el.vehicleTank.value=vehicle?.tank||50;el.vehicleConsumption.value=vehicle?.consumption||6;el.vehicleFuel.value=vehicle?.fuelKey||state.filters.fuelKey;openDialog(el.vehicleDialog)}
function saveVehicleForm(event){event.preventDefault();clearError(el.vehicleError);const vehicle={id:el.vehicleId.value||uid('vehicle'),name:el.vehicleName.value.trim(),plate:el.vehiclePlate.value.trim(),tank:Number(el.vehicleTank.value),consumption:Number(el.vehicleConsumption.value),fuelKey:el.vehicleFuel.value};if(!vehicle.name)return showError(el.vehicleError,'Indica un nombre.');if(!Number.isFinite(vehicle.consumption)||vehicle.consumption<1)return showError(el.vehicleError,'Consumo no válido.');const index=state.vehicles.findIndex(v=>v.id===vehicle.id);if(index>=0)state.vehicles[index]=vehicle;else state.vehicles.unshift(vehicle);state.selectedVehicleId=vehicle.id;saveVehicles();closeDialog(el.vehicleDialog);toast('Vehículo guardado')}
function renderDiscounts(){el.discountList.replaceChildren();if(!state.discounts.length){el.discountList.appendChild(emptyState('No hay descuentos guardados.'));return}for(const d of state.discounts){const node=document.createElement('article');node.className='discount-item';node.innerHTML=`<div><strong>${escapeHtml(d.name)}</strong><span>${d.stationMatch?`Aplicado a: ${escapeHtml(d.stationMatch)}`:'Todas las estaciones'} · ${d.fuelKey==='all'?'Todos los combustibles':fuelLabel(d.fuelKey)}</span><span>${d.type==='percent'?`${num(d.value,1)} %`:`${num(d.value)} €/l`}</span></div><div class="row-actions"><button class="edit" type="button">Editar</button><button class="danger delete" type="button">Eliminar</button></div>`;node.querySelector('.edit').addEventListener('click',()=>openDiscountDialog(d));node.querySelector('.delete').addEventListener('click',()=>{state.discounts=state.discounts.filter(x=>x.id!==d.id);saveDiscounts()});el.discountList.appendChild(node)}}
function openDiscountDialog(discount=null){el.discountForm.reset();clearError(el.discountError);el.discountId.value=discount?.id||'';el.discountDialogTitle.textContent=discount?'Editar descuento':'Añadir descuento';el.discountName.value=discount?.name||'';el.discountStation.value=discount?.stationMatch||'';el.discountFuel.value=discount?.fuelKey||'all';el.discountType.value=discount?.type||'perLiter';el.discountValue.value=discount?.value||.05;openDialog(el.discountDialog)}
function saveDiscountForm(event){event.preventDefault();clearError(el.discountError);const d={id:el.discountId.value||uid('discount'),name:el.discountName.value.trim(),stationMatch:el.discountStation.value.trim(),fuelKey:el.discountFuel.value,type:el.discountType.value,value:Number(el.discountValue.value)};if(!d.name)return showError(el.discountError,'Indica un nombre.');if(!Number.isFinite(d.value)||d.value<=0)return showError(el.discountError,'Valor no válido.');const index=state.discounts.findIndex(x=>x.id===d.id);if(index>=0)state.discounts[index]=d;else state.discounts.unshift(d);saveDiscounts();closeDialog(el.discountDialog);toast('Descuento guardado')}

function populateSettings(){
  $('input[name="apiMode"][value="'+state.settings.apiMode+'"]').checked=true;el.proxyUrl.value=state.settings.proxyUrl;el.proxyToken.value=state.settings.proxyToken;el.precioilKey.value=state.settings.precioilKey;el.googleMapsKey.value=state.settings.googleMapsKey;el.googleMapId.value=state.settings.googleMapId;el.notificationsEnabled.checked=state.settings.notificationsEnabled;el.notificationInterval.value=state.settings.notificationInterval;el.notificationThreshold.value=state.settings.notificationThreshold;el.notificationDirection.value=state.settings.notificationDirection;
}
function saveSettingsForm(event){event.preventDefault();clearError(el.settingsError);const mode=$('input[name="apiMode"]:checked')?.value||'proxy';if(mode==='proxy'&&!el.proxyUrl.value.trim())return showError(el.settingsError,'Indica la URL del servidor seguro.');if(mode==='direct'&&!el.precioilKey.value.trim())return showError(el.settingsError,'Indica la clave de Precioil.');state.settings={apiMode:mode,proxyUrl:el.proxyUrl.value.trim(),proxyToken:el.proxyToken.value.trim(),precioilKey:el.precioilKey.value.trim(),googleMapsKey:el.googleMapsKey.value.trim(),googleMapId:el.googleMapId.value.trim(),notificationsEnabled:el.notificationsEnabled.checked,notificationInterval:Number(el.notificationInterval.value),notificationThreshold:Number(el.notificationThreshold.value),notificationDirection:el.notificationDirection.value};saveSettings();closeDialog(el.settingsDialog);state.mapsPromise=null;toast('Ajustes guardados')}
async function requestNotificationPermission(){
  if(isNative()){try{window.AndroidBridge.requestNotificationPermission();toast('Revisa el permiso de notificaciones del sistema')}catch{}return}
  if(!('Notification' in window))return toast('Este navegador no admite notificaciones.');const result=await Notification.requestPermission();toast(result==='granted'?'Notificaciones permitidas':'Permiso no concedido')
}
function syncNativeConfig(){
  if(!window.AndroidBridge?.syncNotificationConfig)return;const payload={enabled:state.settings.notificationsEnabled,intervalHours:state.settings.notificationInterval,threshold:state.settings.notificationThreshold,direction:state.settings.notificationDirection,apiMode:state.settings.apiMode,proxyUrl:state.settings.proxyUrl,proxyToken:state.settings.proxyToken,precioilKey:state.settings.precioilKey,favorites:state.favorites.filter(f=>f.notifications!==false).map(f=>({id:f.id,name:f.name,latitude:f.latitude,longitude:f.longitude,watchFuel:f.watchFuel,lastPrice:f.lastPrice}))};try{window.AndroidBridge.syncNotificationConfig(JSON.stringify(payload))}catch{}
}

function applyFiltersFromDialog(){state.filters.openFilter=$('input[name="openFilter"]:checked')?.value||'all';state.filters.mapMode=$('input[name="mapMode"]:checked')?.value||'all';state.filters.priceDisplay=$('input[name="priceDisplay"]:checked')?.value||'liter';saveFilters();renderStations();renderMap();closeDialog(el.filtersDialog)}
function populateFilters(){const open=$(`input[name="openFilter"][value="${state.filters.openFilter}"]`),map=$(`input[name="mapMode"][value="${state.filters.mapMode}"]`),price=$(`input[name="priceDisplay"][value="${state.filters.priceDisplay}"]`);if(open)open.checked=true;if(map)map.checked=true;if(price)price.checked=true;el.mapTopTenToggle.setAttribute('aria-pressed',String(state.filters.mapMode==='top10'))}
function exportData(){const blob=new Blob([JSON.stringify({exportedAt:nowIso(),vehicles:state.vehicles,favorites:state.favorites,discounts:state.discounts,history:state.history,settings:{...state.settings,precioilKey:'',proxyToken:'',googleMapsKey:''}},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`combusplus-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}

function bind(){
  el.nav.forEach(b=>b.addEventListener('click',e=>{e.preventDefault();const page=b.dataset.nav;if(page)navigate(page)}));
  el.openSimulation.addEventListener('click',()=>openSimulationFor());el.openSettings.addEventListener('click',()=>{populateSettings();openDialog(el.settingsDialog)});el.openFilters.addEventListener('click',()=>{populateFilters();openDialog(el.filtersDialog)});el.searchStations.addEventListener('click',searchStations);el.refreshMap.addEventListener('click',async()=>{await searchStations();navigate('map')});el.configureMap.addEventListener('click',()=>{populateSettings();openDialog(el.settingsDialog)});
  el.headerVehicleSelect.addEventListener('change',()=>setActiveVehicle(el.headerVehicleSelect.value));el.listFuel.addEventListener('change',()=>{state.filters.fuelKey=el.listFuel.value;saveFilters();renderStations();renderMapPreview()});el.listRadius.addEventListener('change',()=>{state.filters.radius=Number(el.listRadius.value);saveFilters()});el.listSort.addEventListener('change',()=>{state.filters.sort=el.listSort.value;saveFilters();renderStations()});
  el.mapTopTenToggle.addEventListener('click',()=>{state.filters.mapMode=state.filters.mapMode==='top10'?'all':'top10';el.mapTopTenToggle.setAttribute('aria-pressed',String(state.filters.mapMode==='top10'));saveFilters();renderMap()});
  el.globalNotificationsToggle.addEventListener('click',()=>{state.settings.notificationsEnabled=!state.settings.notificationsEnabled;saveSettings();renderFavorites();if(state.settings.notificationsEnabled)requestNotificationPermission()});
  el.exportData.addEventListener('click',exportData);el.clearHistory.addEventListener('click',()=>{if(confirm('¿Borrar todo el historial?')){state.history=[];saveHistory()}});el.newVehicle.addEventListener('click',()=>openVehicleDialog());el.newDiscount.addEventListener('click',()=>openDiscountDialog());
  $$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(document.getElementById(b.dataset.closeDialog))));
  el.detailFavorite.addEventListener('click',()=>state.currentStation&&toggleFavorite(state.currentStation));el.detailAlert.addEventListener('click',()=>{if(!state.currentStation)return;let fav=favoriteById(state.currentStation.id);if(!fav){toggleFavorite(state.currentStation);fav=favoriteById(state.currentStation.id)}fav.notifications=!fav.notifications;saveFavorites();updateDetailFavoriteButtons()});el.detailSimulate.addEventListener('click',()=>{closeDialog(el.stationDialog);openSimulationFor(state.currentStation)});
  el.filtersForm.addEventListener('submit',e=>{e.preventDefault();applyFiltersFromDialog()});el.simulationForm.addEventListener('submit',runSimulation);el.markRefueled.addEventListener('click',markRefueled);el.simVehicle.addEventListener('change',()=>{const v=state.vehicles.find(x=>x.id===el.simVehicle.value);if(v){el.simConsumption.value=v.consumption;el.simFuel.value=v.fuelKey}});el.vehicleForm.addEventListener('submit',saveVehicleForm);el.discountForm.addEventListener('submit',saveDiscountForm);el.settingsForm.addEventListener('submit',saveSettingsForm);el.requestNotifications.addEventListener('click',requestNotificationPermission);
}
function init(){loadState();fillFuelSelect(el.listFuel);fillFuelSelect(el.simFuel);fillFuelSelect(el.vehicleFuel);fillFuelSelect(el.discountFuel,true);el.listFuel.value=state.filters.fuelKey;el.listRadius.value=String(state.filters.radius);el.listSort.value=state.filters.sort;renderVehicleSelectors();renderStations();renderFavorites();renderStats();populateFilters();bind();navigate(location.hash.slice(1)||'list');window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'list'));syncNativeConfig();setTimeout(()=>checkFavoritePrices(true),1200);if(!state.settings.proxyUrl&&!state.settings.precioilKey)setTimeout(()=>{populateSettings();openDialog(el.settingsDialog)},450)}

init();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

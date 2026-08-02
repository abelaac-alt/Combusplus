const ROAD_DISTANCE_FACTOR = 1.18;

export const FUEL_DEFINITIONS = {
  Gasolina95:{label:'Gasolina 95 E5',aliases:['Gasolina95','Gasolina 95','Gasolina 95 E5','Precio Gasolina 95 E5','PrecioGasolina95']},
  Diesel:{label:'Gasóleo A',aliases:['Diesel','Diésel','GasoleoA','Gasóleo A','Precio Gasóleo A','PrecioGasoleoA']},
  Gasolina98:{label:'Gasolina 98 E5',aliases:['Gasolina98','Gasolina 98','Gasolina 98 E5','Precio Gasolina 98 E5','PrecioGasolina98']},
  DieselPremium:{label:'Gasóleo Premium',aliases:['DieselPremium','Diésel Premium','GasoleoPremium','Gasóleo Premium','Precio Gasóleo Premium']},
  GLP:{label:'GLP',aliases:['GLP','Gases licuados del petróleo','Precio GLP']},
  DieselB:{label:'Gasóleo B',aliases:['DieselB','Diésel B','GasoleoB','Gasóleo B','Precio Gasóleo B']}
};

export function parseNumeric(value){
  if(typeof value==='number') return Number.isFinite(value)?value:null;
  if(typeof value!=='string') return null;
  const clean=value.trim().replace(/\s/g,'').replace(',','.').replace(/[^0-9.-]/g,'');
  if(!clean) return null;
  const parsed=Number(clean);return Number.isFinite(parsed)?parsed:null;
}
export function normalizeKey(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
export function getByAliases(object,aliases){
  if(!object||typeof object!=='object')return undefined;
  for(const alias of aliases)if(Object.prototype.hasOwnProperty.call(object,alias))return object[alias];
  const normalized=new Set(aliases.map(normalizeKey));
  for(const [key,value] of Object.entries(object))if(normalized.has(normalizeKey(key)))return value;
  return undefined;
}
export function extractStationArray(payload){
  if(Array.isArray(payload))return payload;
  if(!payload||typeof payload!=='object')return [];
  for(const key of ['items','data','results','estaciones','stations']){
    if(Array.isArray(payload[key]))return payload[key];
    if(payload[key]&&typeof payload[key]==='object'){const nested=extractStationArray(payload[key]);if(nested.length)return nested;}
  }
  return [];
}
export function haversineKm(lat1,lon1,lat2,lon2){
  const r=d=>d*Math.PI/180,R=6371,dLat=r(lat2-lat1),dLon=r(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function normalizeDistance(raw){const value=parseNumeric(raw);if(value===null||value<0)return null;return value>100?value/1000:value}
function parseOpen(raw){
  const explicit=getByAliases(raw,['abierta','abierto','isOpen','open','estadoAbierto']);
  if(typeof explicit==='boolean')return explicit;
  if(typeof explicit==='number')return explicit===1;
  if(typeof explicit==='string'){
    const value=normalizeKey(explicit);if(['si','true','open','abierto','abierta','1'].includes(value))return true;if(['no','false','closed','cerrado','cerrada','0'].includes(value))return false;
  }
  const schedule=String(getByAliases(raw,['horario','schedule','openingHours','Horario'])||'');
  if(/00:00\s*-\s*24:00|24\s*h/i.test(schedule))return true;
  return null;
}
function baseStation(raw,origin){
  const latitude=parseNumeric(getByAliases(raw,['latitud','latitude','lat','Latitud']));
  const longitude=parseNumeric(getByAliases(raw,['longitud','longitude','lon','lng','Longitud']));
  let distanceKm=normalizeDistance(getByAliases(raw,['distancia','distance','distanciaKm','distanceKm','kilometros']));
  if(distanceKm===null&&latitude!==null&&longitude!==null&&origin)distanceKm=haversineKm(origin.latitude,origin.longitude,latitude,longitude);
  if(distanceKm===null)return null;
  const name=getByAliases(raw,['nombreEstacion','rotulo','rótulo','nombre','marca','label'])||'Estación de servicio';
  const address=[getByAliases(raw,['direccion','dirección','address']),getByAliases(raw,['localidad','municipio','city']),getByAliases(raw,['codigoPostal','código postal','postalCode']),getByAliases(raw,['provincia','province'])].filter(Boolean).join(', ');
  const schedule=String(getByAliases(raw,['horario','schedule','openingHours','Horario'])||'Horario no disponible');
  return {
    id:String(getByAliases(raw,['idEstacion','id','stationId','IDEESS'])||`${name}-${latitude}-${longitude}`),name:String(name),address:address||'Dirección no disponible',
    brand:String(getByAliases(raw,['marca','rotulo','rótulo','brand'])||name),latitude,longitude,distanceKm,schedule,isOpen:parseOpen(raw),updatedAt:getByAliases(raw,['updatedAt','fechaActualizacion','fecha','date'])||null,raw
  };
}
export function extractAvailableFuelPrices(raw){
  return Object.entries(FUEL_DEFINITIONS).map(([key,def])=>{const price=parseNumeric(getByAliases(raw,def.aliases));return price&&price>0&&price<5?{key,label:def.label,price}:null}).filter(Boolean);
}
export function normalizeStationForList(raw,origin){const base=baseStation(raw,origin);return base?{...base,fuels:extractAvailableFuelPrices(raw)}:null}
export function priceForFuel(station,fuelKey){return station?.fuels?.find(f=>f.key===fuelKey)?.price??null}
export function discountForStation(station,fuelKey,discounts=[]){
  const haystack=normalizeKey(`${station.name} ${station.brand} ${station.address}`);
  return discounts.reduce((sum,rule)=>{
    if(rule.fuelKey&&rule.fuelKey!=='all'&&rule.fuelKey!==fuelKey)return sum;
    if(rule.stationMatch&&!haystack.includes(normalizeKey(rule.stationMatch)))return sum;
    const raw=Number(rule.value)||0;
    const price=priceForFuel(station,fuelKey)||0;
    return sum+(rule.type==='percent'?price*raw/100:raw);
  },0);
}
export function personalPrice(station,fuelKey,discounts=[]){const base=priceForFuel(station,fuelKey);if(!base)return null;return Math.max(.001,base-discountForStation(station,fuelKey,discounts))}
export function scoreNormalizedStation(station,{fuelKey,discounts=[],consumption,amount,tripMode='roundtrip',roadFactor=ROAD_DISTANCE_FACTOR}){
  const price=personalPrice(station,fuelKey,discounts);if(!price)return null;
  const legs=tripMode==='oneway'?1:2,roadDistanceKm=station.distanceKm*roadFactor,tripKm=roadDistanceKm*legs,purchasedLiters=amount/price,tripLiters=tripKm*consumption/100,netLiters=purchasedLiters-tripLiters;
  if(!Number.isFinite(netLiters)||netLiters<=0)return null;
  return {...station,price,basePrice:priceForFuel(station,fuelKey),discount:discountForStation(station,fuelKey,discounts),roadDistanceKm,tripKm,purchasedLiters,tripLiters,netLiters,effectivePrice:amount/netLiters};
}
export function rankNormalizedStations(stations,input){return stations.map(s=>scoreNormalizedStation(s,input)).filter(Boolean).sort((a,b)=>b.netLiters-a.netLiters||a.distanceKm-b.distanceKm)}
export function scoreFullTankStation(station,{fuelKey,discounts=[],consumption,tankCapacity,tripMode='roundtrip',roadFactor=ROAD_DISTANCE_FACTOR}){
  const price=personalPrice(station,fuelKey,discounts);if(!price)return null;
  const capacity=Number(tankCapacity),usage=Number(consumption);
  if(!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(usage)||usage<=0)return null;
  const legs=tripMode==='oneway'?1:2,roadDistanceKm=station.distanceKm*roadFactor,tripKm=roadDistanceKm*legs,tripLiters=tripKm*usage/100,netLiters=capacity-tripLiters;
  if(!Number.isFinite(netLiters)||netLiters<=0)return null;
  const tankCost=capacity*price,effectivePrice=tankCost/netLiters;
  return {...station,price,basePrice:priceForFuel(station,fuelKey),discount:discountForStation(station,fuelKey,discounts),roadDistanceKm,tripKm,purchasedLiters:capacity,tripLiters,netLiters,effectivePrice,tankCost,fullTank:true};
}
export function rankFullTankStations(stations,input){return stations.map(s=>scoreFullTankStation(s,input)).filter(Boolean).sort((a,b)=>a.effectivePrice-b.effectivePrice||a.distanceKm-b.distanceKm)}
export function equivalentSaving(best,reference){if(!best||!reference||best.id===reference.id)return 0;return Math.max(0,(reference.effectivePrice-best.effectivePrice)*best.netLiters)}
export function mapsUrl(station){return Number.isFinite(station?.latitude)&&Number.isFinite(station?.longitude)?`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${station?.name||''} ${station?.address||''}`)}`}
export function averagePrice(stations,fuelKey,discounts=[]){const values=stations.map(s=>personalPrice(s,fuelKey,discounts)).filter(Boolean);if(!values.length)return null;return values.reduce((a,b)=>a+b,0)/values.length}
export function priceRange(stations,fuelKey,discounts=[]){const values=stations.map(s=>personalPrice(s,fuelKey,discounts)).filter(Boolean);return values.length?{min:Math.min(...values),max:Math.max(...values)}:null}

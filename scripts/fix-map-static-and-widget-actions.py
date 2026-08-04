#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"

styles = STYLES.read_text(encoding="utf-8")
css = r'''
/* Combusplus 9.8: mapa estático y navegación inferior permanente */
:root{
  --cp-bottom-nav-height:76px;
  --cp-map-gap:10px;
}
body.cp-map-screen{
  overflow:hidden !important;
  overscroll-behavior:none !important;
}
.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  height:calc(var(--cp-bottom-nav-height) + var(--safe-bottom)) !important;
  min-height:var(--cp-bottom-nav-height) !important;
  padding-bottom:var(--safe-bottom) !important;
  z-index:2147483000 !important;
  background:#fff !important;
  border-top:1px solid #d8dce2 !important;
  box-shadow:0 -7px 24px rgba(12,18,28,.14) !important;
  visibility:visible !important;
  opacity:1 !important;
}
.bottom-nav[hidden]{
  display:grid !important;
}
main{
  padding-bottom:calc(var(--cp-bottom-nav-height) + var(--safe-bottom)) !important;
}
.page[data-page="map"]{
  position:fixed !important;
  inset:
    var(--safe-top)
    0
    calc(var(--cp-bottom-nav-height) + var(--safe-bottom))
    0 !important;
  display:none;
  grid-template-rows:auto auto auto minmax(0,1fr) !important;
  gap:var(--cp-map-gap) !important;
  overflow:hidden !important;
  padding:18px clamp(14px,3vw,24px) 10px !important;
  background:#f4f5f7 !important;
}
.page[data-page="map"].is-active{
  display:grid !important;
}
.page[data-page="map"] .page-head,
.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card,
.page[data-page="map"] .map-toolbar{
  margin:0 !important;
  flex:none !important;
}
.page[data-page="map"] #googleMap{
  position:relative !important;
  width:100% !important;
  height:100% !important;
  min-height:0 !important;
  max-height:none !important;
  margin:0 !important;
  overflow:hidden !important;
  border:3px solid #d1131b !important;
  border-radius:16px !important;
  box-sizing:border-box !important;
  background:#eef0f3 !important;
  contain:layout paint !important;
  isolation:isolate !important;
}
.page[data-page="map"] #mapPreviewList{
  display:none !important;
}
'''
if "Combusplus 9.8: mapa estático" not in styles:
    styles += "\n" + css
STYLES.write_text(styles, encoding="utf-8")

app = APP.read_text(encoding="utf-8")

append = r'''
/* Combusplus 9.8 */
function syncMapScreenModeV98() {
  const mapPage = document.querySelector(
    '.page.is-active[data-page="map"]'
  );
  document.body.classList.toggle('cp-map-screen', Boolean(mapPage));

  const nav = document.querySelector('.bottom-nav');
  if (nav) {
    nav.hidden = false;
    nav.removeAttribute('aria-hidden');
    nav.style.display = 'grid';
  }

  if (!mapPage) {
    try { window.AndroidBridge?.hideNativeMap?.(); } catch {}
  }
}

function syncFavoritesWidgetV98() {
  if (!window.AndroidBridge?.syncNotificationConfig) return;

  try {
    const payload = {
      enabled: Boolean(state.settings.notificationsEnabled),
      intervalHours: Number(state.settings.notificationInterval || 6),
      threshold: Number(state.settings.notificationThreshold || 0.001),
      direction: state.settings.notificationDirection || 'both',
      functionsUrl: state.settings.supabaseFunctionsUrl || '',
      publishableKey: state.settings.supabasePublishableKey || '',
      installationId: readStoredValue(STORAGE.installationId) || '',
      sessionToken:
        state.backendSession.token ||
        readStoredValue(STORAGE.sessionToken) ||
        '',
      sessionExpiresAt: Number(
        state.backendSession.expiresAt ||
        readStoredValue(STORAGE.sessionExpiresAt) ||
        0
      ),
      selectedVehicleId: state.selectedVehicleId,
      vehicles: state.vehicles,
      discounts: state.discounts,
      favorites: state.favorites.map(favorite => ({
        id: favorite.id,
        name: favorite.name,
        address: favorite.address,
        latitude: favorite.latitude,
        longitude: favorite.longitude,
        watchFuel:
          favorite.watchFuel ||
          state.filters.fuelKey,
        lastPrice: favorite.lastPrice,
        lastChange: favorite.lastChange,
        lastChecked: favorite.lastChecked,
        notifications: favorite.notifications !== false
      }))
    };

    window.AndroidBridge.syncNotificationConfig(
      JSON.stringify(payload)
    );
  } catch {
  }
}

let fullTankWidgetHandledV98 = false;
async function executeFullTankWidgetSearchV98() {
  if (fullTankWidgetHandledV98) return;

  let requested = false;
  try {
    requested = Boolean(
      window.AndroidBridge?.consumeFullTankLaunch?.()
    );
  } catch {
    requested = false;
  }

  if (!requested) return;
  fullTankWidgetHandledV98 = true;

  document.querySelector('[data-nav="list"]')?.click();

  const fullTankRadio = document.querySelector(
    'input[name="searchMode"][value="fullTank"]'
  );
  if (fullTankRadio) {
    fullTankRadio.checked = true;
    fullTankRadio.dispatchEvent(
      new Event('change', { bubbles: true })
    );
  }

  window.setTimeout(() => {
    const form = document.querySelector('#quickSearchForm');
    if (form?.requestSubmit) {
      form.requestSubmit();
    } else {
      document.querySelector('#quickSearchButton')?.click();
    }
  }, 350);
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-nav]')) {
    window.setTimeout(syncMapScreenModeV98, 20);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  syncMapScreenModeV98();
  syncFavoritesWidgetV98();
  window.setTimeout(executeFullTankWidgetSearchV98, 450);
});

window.addEventListener('load', () => {
  syncMapScreenModeV98();
  syncFavoritesWidgetV98();
  window.setTimeout(executeFullTankWidgetSearchV98, 250);
});

window.addEventListener('hashchange', () => {
  window.setTimeout(syncMapScreenModeV98, 20);
});

new MutationObserver(syncMapScreenModeV98).observe(
  document.body,
  {
    subtree:true,
    attributes:true,
    attributeFilter:['class','hidden','style','aria-hidden']
  }
);
'''
if "function syncMapScreenModeV98()" not in app:
    app += "\n" + append

app = app.replace(
    "function saveFavorites() { writeJSON(STORAGE.favorites, state.favorites); renderFavorites(); renderHomeWidgets(); renderStations(); renderMapPreview(); syncNativeConfig(); }",
    "function saveFavorites() { writeJSON(STORAGE.favorites, state.favorites); renderFavorites(); renderHomeWidgets(); renderStations(); renderMapPreview(); syncNativeConfig(); syncFavoritesWidgetV98(); }"
)

APP.write_text(app, encoding="utf-8")
print("Mapa estático, marcadores de precio y widgets corregidos.")

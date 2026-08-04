#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"
STYLES = ROOT / "web/assets/styles.css"

styles = STYLES.read_text(encoding="utf-8")
css = r'''
/* Combusplus 9.9: composición exacta de mapa y menú */
:root{
  --cp-live-header:0px;
  --cp-live-nav:76px;
  --cp-map-padding-x:18px;
}

.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  height:var(--cp-live-nav) !important;
  min-height:var(--cp-live-nav) !important;
  z-index:2147483000 !important;
  visibility:visible !important;
  opacity:1 !important;
  display:grid !important;
  background:#fff !important;
}

body.cp-map-screen{
  overflow:hidden !important;
  overscroll-behavior:none !important;
}

body.cp-map-screen main{
  padding:0 !important;
  margin:0 !important;
}

.page[data-page="map"]{
  position:fixed !important;
  top:var(--cp-live-header) !important;
  right:0 !important;
  bottom:var(--cp-live-nav) !important;
  left:0 !important;
  display:none !important;
  grid-template-rows:auto auto auto auto minmax(220px,1fr) !important;
  gap:8px !important;
  overflow:hidden !important;
  padding:12px var(--cp-map-padding-x) 10px !important;
  margin:0 !important;
  background:#f4f5f7 !important;
  box-sizing:border-box !important;
}

.page[data-page="map"].is-active{
  display:grid !important;
}

.page[data-page="map"] > *{
  min-width:0 !important;
}

.page[data-page="map"] .page-head{
  margin:0 !important;
  min-height:46px !important;
}

.page[data-page="map"] .page-head h1{
  margin:1px 0 0 !important;
  font-size:30px !important;
  line-height:1 !important;
}

.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card,
.page[data-page="map"] .map-toolbar{
  margin:0 !important;
  border-radius:10px !important;
  box-sizing:border-box !important;
}

.page[data-page="map"] .map-search-card{
  padding:12px 14px !important;
}

.page[data-page="map"] .map-search-card label,
.page[data-page="map"] .map-search-card strong{
  margin:0 0 6px !important;
}

.page[data-page="map"] .map-search-card input,
.page[data-page="map"] .map-search-card button{
  min-height:48px !important;
}

.page[data-page="map"] .map-open-filter-card{
  min-height:58px !important;
  padding:10px 14px !important;
}

.page[data-page="map"] .map-toolbar{
  min-height:50px !important;
  padding:10px 14px !important;
}

.page[data-page="map"] #googleMap{
  position:relative !important;
  align-self:stretch !important;
  justify-self:stretch !important;
  width:100% !important;
  height:100% !important;
  min-height:220px !important;
  max-height:none !important;
  margin:0 !important;
  padding:0 !important;
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

@media (max-height:760px){
  .page[data-page="map"]{
    gap:6px !important;
    padding-top:8px !important;
  }
  .page[data-page="map"] .page-head{
    min-height:38px !important;
  }
  .page[data-page="map"] .page-head .eyebrow{
    display:none !important;
  }
  .page[data-page="map"] .page-head h1{
    font-size:27px !important;
  }
  .page[data-page="map"] .map-search-card{
    padding:8px 10px !important;
  }
  .page[data-page="map"] .map-search-card input,
  .page[data-page="map"] .map-search-card button{
    min-height:42px !important;
  }
  .page[data-page="map"] .map-open-filter-card,
  .page[data-page="map"] .map-toolbar{
    min-height:46px !important;
    padding:7px 10px !important;
  }
}
'''
if "Combusplus 9.9: composición exacta" not in styles:
    styles += "\n" + css
STYLES.write_text(styles, encoding="utf-8")

app = APP.read_text(encoding="utf-8")
js = r'''
/* Combusplus 9.9 */
function applyExactShellMetricsV99() {
  const header = document.querySelector('.app-header');
  const nav = document.querySelector('.bottom-nav');
  const root = document.documentElement;

  const headerHeight = header && getComputedStyle(header).display !== 'none'
    ? Math.ceil(header.getBoundingClientRect().height)
    : 0;
  const navHeight = nav
    ? Math.ceil(nav.getBoundingClientRect().height)
    : 76;

  root.style.setProperty('--cp-live-header', `${headerHeight}px`);
  root.style.setProperty('--cp-live-nav', `${Math.max(64, navHeight)}px`);

  const mapActive = Boolean(
    document.querySelector('.page.is-active[data-page="map"]')
  );
  document.body.classList.toggle('cp-map-screen', mapActive);

  if (nav) {
    nav.hidden = false;
    nav.style.display = 'grid';
    nav.style.visibility = 'visible';
  }

  if (mapActive) {
    window.setTimeout(() => {
      try { scheduleNativeMapSync(); } catch {}
    }, 40);
  }
}

let shellMetricFrameV99 = 0;
function scheduleExactShellMetricsV99() {
  cancelAnimationFrame(shellMetricFrameV99);
  shellMetricFrameV99 = requestAnimationFrame(applyExactShellMetricsV99);
}

document.addEventListener('DOMContentLoaded', scheduleExactShellMetricsV99);
window.addEventListener('load', scheduleExactShellMetricsV99);
window.addEventListener('resize', scheduleExactShellMetricsV99);
window.visualViewport?.addEventListener('resize', scheduleExactShellMetricsV99);
window.addEventListener('hashchange', scheduleExactShellMetricsV99);

document.addEventListener('click', event => {
  if (event.target.closest('[data-nav]')) {
    window.setTimeout(scheduleExactShellMetricsV99, 10);
  }
});

new ResizeObserver(scheduleExactShellMetricsV99).observe(
  document.querySelector('.app-shell') || document.body
);
'''
if "function applyExactShellMetricsV99()" not in app:
    app += "\n" + js
APP.write_text(app, encoding="utf-8")
print("Diseño de mapa 9.9 aplicado.")

#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / 'web/assets/styles.css'
APP = ROOT / 'web/src/app.js'

styles = STYLES.read_text(encoding='utf-8')
css = r'''
/* Combusplus 9.7: navegación inferior fija, mapa sin hueco y widgets renovados */
:root{
  --bottom-nav-height:74px;
}
.app-shell{
  min-height:100dvh !important;
  padding-bottom:calc(var(--bottom-nav-height) + var(--safe-bottom) + 18px) !important;
}
main{
  padding-bottom:calc(var(--bottom-nav-height) + var(--safe-bottom) + 24px) !important;
}
.bottom-nav{
  position:fixed !important;
  left:50% !important;
  right:auto !important;
  bottom:0 !important;
  transform:translateX(-50%) !important;
  width:min(100%,1180px) !important;
  min-height:var(--bottom-nav-height) !important;
  padding-bottom:var(--safe-bottom) !important;
  z-index:10000 !important;
  background:rgba(255,255,255,.98) !important;
  border-top:1px solid #d9dde3 !important;
  box-shadow:0 -8px 24px rgba(15,20,30,.12) !important;
  backdrop-filter:blur(14px);
}
.bottom-nav .nav-item{
  min-height:var(--bottom-nav-height) !important;
  background:transparent !important;
}
.bottom-nav .nav-item.is-active{
  background:#fff0f1 !important;
  color:var(--red) !important;
}
.page[data-page="map"]{
  padding-bottom:calc(var(--bottom-nav-height) + var(--safe-bottom) + 16px) !important;
}
.page[data-page="map"] #googleMap{
  margin-top:0 !important;
}
.page[data-page="map"] .map-toolbar,
.page[data-page="map"] .map-search-card,
.page[data-page="map"] .map-open-filter-card{
  margin-bottom:10px !important;
}
.page[data-page="map"] .map-toolbar + #googleMap,
.page[data-page="map"] .map-open-filter-card + .map-toolbar,
.page[data-page="map"] .map-toolbar + .map-frame,
.page[data-page="map"] .map-toolbar + .map-card{
  margin-top:0 !important;
}
.page[data-page="map"] .map-frame,
.page[data-page="map"] .map-card,
.page[data-page="map"] .map-panel{
  margin-top:0 !important;
}
.home-widget-grid{
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr)) !important;
  gap:16px !important;
}
.home-widget{
  border:0 !important;
  border-radius:18px !important;
  overflow:hidden !important;
  box-shadow:0 14px 36px rgba(13,20,33,.11) !important;
}
.home-widget-head{
  padding:17px 18px 14px !important;
  background:linear-gradient(135deg,#fff 0%,#fafbfc 100%) !important;
}
.icon-text-btn{
  min-width:94px !important;
  height:38px !important;
  border-radius:999px !important;
  border-color:#e4b5b8 !important;
  background:#fff4f5 !important;
  font-size:12px !important;
}
.favorite-widget-row{
  min-height:62px !important;
  padding:12px 18px !important;
}
.favorite-widget-price strong{
  font-size:17px !important;
  color:var(--red) !important;
}
.full-tank-widget{
  border-radius:18px !important;
  border-left:0 !important;
  padding:20px !important;
  background:linear-gradient(145deg,#111318 0%,#1b2030 58%,#6e1117 100%) !important;
}
.full-tank-action{
  border-radius:12px !important;
}
'''
if 'Combusplus 9.7: navegación inferior fija' not in styles:
    styles += '\n' + css
STYLES.write_text(styles, encoding='utf-8')

app = APP.read_text(encoding='utf-8')
# Evita que modales o vistas cambien la posición del menú inferior.
if 'function enforceStaticBottomNavigationV97()' not in app:
    app += r'''

function enforceStaticBottomNavigationV97() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  nav.hidden = false;
  nav.removeAttribute('aria-hidden');
  nav.style.display = 'grid';
}

document.addEventListener('DOMContentLoaded', enforceStaticBottomNavigationV97);
window.addEventListener('load', enforceStaticBottomNavigationV97);
new MutationObserver(enforceStaticBottomNavigationV97).observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden', 'style', 'aria-hidden']
});
'''
APP.write_text(app, encoding='utf-8')
print('Menú inferior fijo, hueco eliminado y widgets web renovados.')

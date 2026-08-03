package com.grupomds.combusplus;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 1001;
    private static final String LOCAL_URL =
            "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView webView;
    private WebBridge webBridge;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SecureLocalStore.migrateLegacy(this);
        NotificationHelper.createChannel(this);
        PriceWatchScheduler.restore(this);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(
                getWindow(),
                getWindow().getDecorView()
        );
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        boolean fullTank = getIntent().getBooleanExtra("auto_full_tank", false);
        webBridge = new WebBridge(this, fullTank);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler(
                        "/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this)
                )
                .build();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(17, 18, 20));
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(0xFFF3F4F6);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setVerticalScrollBarEnabled(false);

        root.addView(webView);
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() |
                    WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    systemBars.bottom
            );
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(root);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setUserAgentString(
                settings.getUserAgentString() + " CombusplusAndroid/9.4.2"
        );

        webView.addJavascriptInterface(webBridge, "AndroidBridge");

        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                if (
                    origin == null ||
                    !origin.startsWith("https://appassets.androidplatform.net")
                ) {
                    callback.invoke(origin, false, false);
                    return;
                }

                if (
                    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
                ) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(
                            new String[]{
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                            },
                            LOCATION_REQUEST
                    );
                }
            }
        });

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    WebResourceRequest request
            ) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    String url
            ) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
            ) {
                return openExternalWhenNeeded(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalWhenNeeded(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(nativeEnhancementsScript(), null);
            }
        });

        loadRequestedPage(getIntent());
    }

    private String nativeEnhancementsScript() {
        return "(function(){" +
            "if(window.__combusplusNativeV942)return;" +
            "window.__combusplusNativeV942=true;" +
            "document.documentElement.classList.add('native-shell');" +
            "document.documentElement.style.overflowX='hidden';" +
            "document.body.style.overflowX='hidden';" +

            "var css=document.createElement('style');" +
            "css.textContent=" +
            "'#openNativeGoogleMap{display:none!important}'+" +
            "'.native-map-placeholder{display:grid;place-items:center;min-height:260px;background:#fff;border:1px solid #d8dbe0;text-align:center;padding:28px;font-weight:700}'+" +
            "'.cp-gate{position:fixed;inset:0;z-index:999999;background:rgba(9,11,15,.94);display:flex;align-items:center;justify-content:center;padding:18px}'+" +
            "'.cp-card{width:min(100%,520px);max-height:90vh;overflow:auto;background:#fff;color:#17191d;border-radius:22px;padding:24px;box-shadow:0 24px 90px rgba(0,0,0,.45)}'+" +
            "'.cp-card h2{font-size:28px;line-height:1.08;margin:8px 0 12px}'+" +
            "'.cp-card p{line-height:1.55;color:#555b66}'+" +
            "'.cp-card label{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #d8dbe0;border-radius:12px;background:#f7f8fa;margin:16px 0}'+" +
            "'.cp-card input{width:22px;height:22px;flex:0 0 auto}'+" +
            "'.cp-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}'+" +
            "'.cp-actions button{border:0;border-radius:10px;padding:13px 18px;font-weight:700}'+" +
            "'.cp-primary{background:#b3131b;color:#fff}'+" +
            "'.cp-primary:disabled{opacity:.45}'+" +
            "'.cp-secondary{background:#e9ebef;color:#17191d}'+" +
            "'.cp-progress{display:flex;gap:7px;margin-bottom:16px}'+" +
            "'.cp-progress i{height:5px;flex:1;background:#e3e5e9;border-radius:99px}'+" +
            "'.cp-progress i.on{background:#b3131b}'+" +
            "'.cp-highlight{position:relative!important;z-index:999998!important;box-shadow:0 0 0 5px #fff,0 0 0 10px #b3131b!important;border-radius:10px!important}'+" +
            "'.cp-tip{position:fixed;left:18px;right:18px;bottom:92px;z-index:999999;background:#111318;color:#fff;border-radius:16px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.4)}'+" +
            "'.cp-tip strong{display:block;font-size:20px;margin-bottom:6px}.cp-tip p{margin:0 0 14px;color:#d7d9de;line-height:1.45}'+" +
            "'.cp-tip button{border:0;border-radius:9px;padding:11px 15px;font-weight:700}.cp-tip .next{background:#fff;color:#111318;float:right}.cp-tip .skip{background:transparent;color:#fff}'+" +
            "'.cp-privacy-link{display:inline-block;color:#a40f18;font-weight:700;margin-top:4px}';" +
            "document.head.appendChild(css);" +

            "var privacyKey='combusplus.v942.privacyAccepted';" +
            "var tutorialKey='combusplus.v942.interactiveTutorialDone';" +
            "var get=function(k){try{return localStorage.getItem(k)||AndroidBridge.getLocalValue(k)||'';}catch(e){return '';}};" +
            "var set=function(k,v){try{localStorage.setItem(k,v);}catch(e){}try{AndroidBridge.saveLocalValue(k,v);}catch(e){}};" +

            "var startTutorial=function(){" +
            " if(get(tutorialKey)==='1')return;" +
            " var steps=[" +
            "  {nav:'profile',sel:'#newVehicle',title:'Añade tu vehículo',text:'En Perfil, pulsa «Nuevo vehículo» y guarda el combustible, consumo medio y capacidad del depósito.'}," +
            "  {nav:'list',sel:'#quickVehicle',title:'Selecciona el vehículo',text:'Vuelve a Buscar y elige el vehículo que acabas de guardar.'}," +
            "  {nav:'list',sel:'#quickAmount',title:'Elige el repostaje',text:'Busca por importe o activa «Depósito lleno». También puedes elegir ida o ida y vuelta.'}," +
            "  {nav:'list',sel:'#quickSearchButton',title:'Compara las gasolineras',text:'Pulsa aquí. Combusplus tendrá en cuenta precio, distancia y combustible gastado en el trayecto.'}," +
            "  {nav:'map',sel:'[data-nav=\"map\"]',title:'Consulta el mapa',text:'En Mapa verás directamente Google Maps nativo con las gasolineras cercanas.'}," +
            "  {nav:'favorites',sel:'[data-nav=\"favorites\"]',title:'Guarda favoritos',text:'Marca tus gasolineras habituales para controlar sus precios y recibir avisos.'}" +
            " ];" +
            " var index=0,tip=null,last=null;" +
            " var clear=function(){if(last)last.classList.remove('cp-highlight');last=null;if(tip)tip.remove();tip=null;};" +
            " var show=function(){" +
            "  clear();" +
            "  var s=steps[index];" +
            "  var nav=document.querySelector('[data-nav=\"'+s.nav+'\"]');" +
            "  if(nav)nav.click();" +
            "  setTimeout(function(){" +
            "   var target=document.querySelector(s.sel)||nav;" +
            "   if(target){target.classList.add('cp-highlight');target.scrollIntoView({behavior:'smooth',block:'center'});last=target;}" +
            "   tip=document.createElement('div');tip.className='cp-tip';" +
            "   tip.innerHTML='<strong>Paso '+(index+1)+' de '+steps.length+': '+s.title+'</strong><p>'+s.text+'</p><button class=\"skip\">Omitir</button><button class=\"next\">'+(index===steps.length-1?'Finalizar':'Siguiente')+'</button>';" +
            "   document.body.appendChild(tip);" +
            "   tip.querySelector('.skip').onclick=function(){set(tutorialKey,'1');clear();};" +
            "   tip.querySelector('.next').onclick=function(){if(index===steps.length-1){set(tutorialKey,'1');clear();}else{index++;show();}};" +
            "  },180);" +
            " };" +
            " show();" +
            "};" +

            "var showPrivacy=function(){" +
            " if(get(privacyKey)==='1'){startTutorial();return;}" +
            " var gate=document.createElement('div');gate.className='cp-gate';" +
            " gate.innerHTML='<section class=\"cp-card\"><div class=\"cp-progress\"><i class=\"on\"></i><i></i></div><small>ANTES DE EMPEZAR</small><h2>Privacidad y condiciones de uso</h2><p>Combusplus no requiere registro. Los vehículos, favoritos, ajustes e historial se guardan en tu dispositivo. La ubicación se utiliza para encontrar gasolineras y calcular trayectos.</p><label><input id=\"cpPrivacyCheck\" type=\"checkbox\"><span>He leído y acepto la <a class=\"cp-privacy-link\" href=\"./privacy.html\" target=\"_blank\">Política de privacidad</a>.</span></label><p id=\"cpPrivacyError\" style=\"display:none;color:#a40f18;font-weight:700\">Debes aceptar la Política de privacidad para continuar.</p><div class=\"cp-actions\"><button id=\"cpAccept\" class=\"cp-primary\" disabled>Aceptar y continuar</button></div></section>';" +
            " document.body.appendChild(gate);" +
            " document.documentElement.style.overflow='hidden';" +
            " var check=gate.querySelector('#cpPrivacyCheck'),accept=gate.querySelector('#cpAccept'),err=gate.querySelector('#cpPrivacyError');" +
            " check.onchange=function(){accept.disabled=!check.checked;err.style.display='none';};" +
            " accept.onclick=function(){if(!check.checked){err.style.display='block';return;}set(privacyKey,'1');gate.remove();document.documentElement.style.overflow='';startTutorial();};" +
            "};" +

            "var hideLegacyMap=function(){" +
            " var page=document.querySelector('.page[data-page=\"map\"]');" +
            " if(!page)return;" +
            " var old=document.getElementById('openNativeGoogleMap');if(old)old.remove();" +
            " var map=page.querySelector('#googleMap');if(map)map.style.display='none';" +
            " var preview=page.querySelector('#mapPreviewList');if(preview)preview.style.display='none';" +
            " var warning=page.querySelector('#configureMap');if(warning)warning.style.display='none';" +
            " if(!page.querySelector('.native-map-placeholder')){" +
            "  var holder=document.createElement('div');holder.className='native-map-placeholder';holder.textContent='Google Maps se abre automáticamente dentro de Combusplus al entrar en esta sección.';" +
            "  var anchor=page.querySelector('#googleMap')||page.lastElementChild;anchor.parentNode.insertBefore(holder,anchor);" +
            " }" +
            "};" +

            "var mapOpening=false;" +
            "var openNativeMap=function(){" +
            " if(mapOpening||get(privacyKey)!=='1')return;" +
            " mapOpening=true;hideLegacyMap();" +
            " if(!navigator.geolocation){mapOpening=false;return;}" +
            " navigator.geolocation.getCurrentPosition(function(pos){" +
            "  mapOpening=false;" +
            "  AndroidBridge.openNativeMapAt(pos.coords.latitude,pos.coords.longitude);" +
            " },function(){" +
            "  mapOpening=false;" +
            "  var holder=document.querySelector('.native-map-placeholder');" +
            "  if(holder)holder.textContent='Activa el permiso de ubicación para mostrar las gasolineras cercanas.';" +
            " },{enableHighAccuracy:true,timeout:18000,maximumAge:30000});" +
            "};" +

            "document.addEventListener('click',function(event){" +
            " var mapNav=event.target.closest('[data-nav=\"map\"]');" +
            " if(mapNav)setTimeout(openNativeMap,120);" +
            " var refresh=event.target.closest('#refreshMap');" +
            " if(refresh){event.preventDefault();setTimeout(openNativeMap,60);}" +
            "});" +
            "window.addEventListener('hashchange',function(){hideLegacyMap();});" +
            "new MutationObserver(hideLegacyMap).observe(document.body,{subtree:true,childList:true});" +
            "hideLegacyMap();showPrivacy();" +
            "})();";
    }

    private boolean openExternalWhenNeeded(Uri uri) {
        if (isTrusted(uri)) return false;

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    private void loadRequestedPage(Intent intent) {
        String page = intent.getStringExtra("open_page");
        String url = LOCAL_URL;

        if (page != null && !page.trim().isEmpty()) {
            url += "#" + page;
        }

        webView.loadUrl(url);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        webBridge.setFullTankLaunch(
                intent.getBooleanExtra("auto_full_tank", false)
        );
        loadRequestedPage(intent);
    }

    private boolean isTrusted(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) &&
                "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost());
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null) {
            boolean granted =
                    grantResults.length > 0 &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED;

            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    public void deliverIntegrityResult(
            String requestId,
            String token,
            String error
    ) {
        if (webView == null) return;

        String javascript =
                "window.CombusplusNative && window.CombusplusNative.resolveIntegrity(" +
                JSONObject.quote(requestId == null ? "" : requestId) + "," +
                JSONObject.quote(token == null ? "" : token) + "," +
                JSONObject.quote(error == null ? "" : error) +
                ");";

        webView.evaluateJavascript(javascript, null);
    }

    public void requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    1002
            );
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

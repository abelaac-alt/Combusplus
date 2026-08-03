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
                settings.getUserAgentString() + " CombusplusAndroid/9.4"
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

                String script =
                    "(function(){" +
                    "document.documentElement.classList.add('native-shell');" +
                    "document.documentElement.style.overflowX='hidden';" +
                    "document.body.style.overflowX='hidden';" +
                    "if(window.__combusplusNativeMapInstalled)return;" +
                    "window.__combusplusNativeMapInstalled=true;" +
                    "var add=function(){" +
                    " var page=document.querySelector('#page-map,.page[data-page=\"map\"],main[data-page=\"map\"]');" +
                    " if(!page)return;" +
                    " if(document.getElementById('openNativeGoogleMap'))return;" +
                    " var b=document.createElement('button');" +
                    " b.id='openNativeGoogleMap';" +
                    " b.type='button';" +
                    " b.textContent='Abrir Google Maps';" +
                    " b.style.cssText='display:block;width:100%;margin:12px 0;padding:12px;border:0;border-radius:6px;background:#b3131b;color:#fff;font-weight:700';" +
                    " b.onclick=function(){AndroidBridge.openNativeMap();};" +
                    " var target=page.querySelector('#googleMap,.map-card,.map-wrap')||page;" +
                    " target.parentNode.insertBefore(b,target);" +
                    "};" +
                    "add();" +
                    "new MutationObserver(add).observe(document.body,{subtree:true,childList:true,attributes:true});" +
                    "window.addEventListener('hashchange',add);" +
                    "})();";

                view.evaluateJavascript(script, null);
            }
        });

        loadRequestedPage(getIntent());
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

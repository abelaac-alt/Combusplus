package com.grupomds.combusplus;

import android.Manifest;
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

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

public class MainActivity extends ComponentActivity {
    private static final int LOCATION_REQUEST = 1001;
    private static final String LOCAL_URL =
            "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView webView;
    private WebBridge webBridge;
    private EmbeddedMapController embeddedMap;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SecureLocalStore.migrateLegacy(this);
        NotificationHelper.createChannel(this);
        PriceWatchScheduler.restore(this);

        getOnBackPressedDispatcher().addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }

                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                    }
                }
        );

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
        embeddedMap = new EmbeddedMapController(this, root, webView);
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
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setUserAgentString(
                settings.getUserAgentString() +
                        " CombusplusAndroid/" + BuildConfig.VERSION_NAME
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
            "var old=document.getElementById('openNativeGoogleMap');if(old)old.remove();" +
            "document.documentElement.classList.add('native-shell');" +
            "})();";
    }

    public void renderEmbeddedMap(
            String stationsJson,
            double left,
            double top,
            double width,
            double height
    ) {
        if (embeddedMap != null) {
            embeddedMap.render(stationsJson, left, top, width, height);
        }
    }

    public void renderEmbeddedMapV2(
            String stationsJson,
            double left,
            double top,
            double width,
            double height,
            double viewportWidth,
            double navigationTop
    ) {
        if (embeddedMap != null) {
            embeddedMap.renderV2(
                    stationsJson,
                    left,
                    top,
                    width,
                    height,
                    viewportWidth,
                    navigationTop
            );
        }
    }

    public void hideEmbeddedMap() {
        if (embeddedMap != null) embeddedMap.hide();
    }

    public void openStationFromNative(String stationId) {
        if (webView == null) return;
        String script =
                "window.CombusplusNativeMap && " +
                "window.CombusplusNativeMap.openStation(" +
                JSONObject.quote(stationId == null ? "" : stationId) +
                ");";
        webView.evaluateJavascript(script, null);
    }

    private boolean openExternalWhenNeeded(Uri uri) {
        if (isTrusted(uri)) return false;

        String scheme = uri == null ? "" : String.valueOf(uri.getScheme());
        if (
            !"https".equalsIgnoreCase(scheme) &&
            !"geo".equalsIgnoreCase(scheme) &&
            !"market".equalsIgnoreCase(scheme)
        ) {
            return true;
        }

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
    protected void onResume() {
        super.onResume();
        if (embeddedMap != null) embeddedMap.onResume();
    }

    @Override
    protected void onPause() {
        if (embeddedMap != null) embeddedMap.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (embeddedMap != null) embeddedMap.destroy();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

}

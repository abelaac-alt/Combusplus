package com.grupomds.combusplus;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.net.URI;

public class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 1001;
    private WebView webView;
    private boolean fallbackLoaded = false;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        NotificationHelper.createChannel(this);
        PriceWatchScheduler.restore(this);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(0xFFF3F4F6);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHorizontalScrollBarEnabled(false);
        setContentView(webView);

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " CombusplusAndroid/5.3");

        webView.addJavascriptInterface(new WebBridge(this), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                            LOCATION_REQUEST
                    );
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isTrusted(uri)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // El enlace externo no tiene una aplicación compatible.
                }
                return true;
            }

            private void loadLocalFallback(WebView view) {
                if (!fallbackLoaded) {
                    fallbackLoaded = true;
                    view.loadUrl("file:///android_asset/www/index.html");
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) loadLocalFallback(view);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame() && errorResponse.getStatusCode() >= 400) {
                    loadLocalFallback(view);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                        "document.documentElement.classList.add('native-shell');" +
                        "document.documentElement.style.overflowX='hidden';" +
                        "document.body.style.overflowX='hidden';",
                        null
                );
            }
        });

        String page = getIntent().getStringExtra("open_page");
        String url = "file:///android_asset/www/index.html";
        if (page != null && !page.trim().isEmpty()) url += "#" + page;
        fallbackLoaded = true;
        webView.loadUrl(url);
    }

    private boolean isTrusted(Uri uri) {
        if ("file".equalsIgnoreCase(uri.getScheme())) return true;
        try {
            URI configured = URI.create(BuildConfig.WEB_APP_URL);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && configured.getHost() != null
                    && configured.getHost().equalsIgnoreCase(uri.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1002);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}

package com.grupomds.combusplus;

import android.content.Intent;
import android.webkit.JavascriptInterface;

public class WebBridge {
    public static final String CACHE_PREFS = "combusplus_web_cache";
    public static final String LAST_LATITUDE = "combusplus.native.lastLatitude";
    public static final String LAST_LONGITUDE = "combusplus.native.lastLongitude";
    public static final String LAST_LOCATION_AT = "combusplus.native.lastLocationAt";

    private final MainActivity activity;
    private final PlayIntegrityProvider integrityProvider;
    private volatile boolean fullTankLaunch;

    public WebBridge(MainActivity activity, boolean fullTankLaunch) {
        this.activity = activity;
        this.fullTankLaunch = fullTankLaunch;
        this.integrityProvider = new PlayIntegrityProvider(activity);
    }

    public void setFullTankLaunch(boolean value) {
        fullTankLaunch = value;
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public boolean consumeFullTankLaunch() {
        boolean value = fullTankLaunch;
        fullTankLaunch = false;
        return value;
    }

    @JavascriptInterface
    public void renderNativeMap(
            String stationsJson,
            double left,
            double top,
            double width,
            double height
    ) {
        if (stationsJson == null || stationsJson.length() > 2_000_000) return;
        activity.runOnUiThread(() ->
                activity.renderEmbeddedMap(stationsJson, left, top, width, height)
        );
    }

    @JavascriptInterface
    public void renderNativeMapV2(
            String stationsJson,
            double left,
            double top,
            double width,
            double height,
            double viewportWidth,
            double navigationTop
    ) {
        if (stationsJson == null || stationsJson.length() > 2_000_000) return;
        activity.runOnUiThread(() ->
                activity.renderEmbeddedMapV2(
                        stationsJson,
                        left,
                        top,
                        width,
                        height,
                        viewportWidth,
                        navigationTop
                )
        );
    }

    @JavascriptInterface
    public void hideNativeMap() {
        activity.runOnUiThread(activity::hideEmbeddedMap);
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(activity::requestNotificationPermission);
    }

    @JavascriptInterface
    public void requestIntegrityToken(String requestId, String requestHash) {
        if (
            requestId == null ||
            requestId.length() > 120 ||
            requestHash == null ||
            requestHash.length() > 200
        ) {
            return;
        }

        integrityProvider.requestToken(
            requestHash,
            (token, error) -> activity.runOnUiThread(
                () -> activity.deliverIntegrityResult(requestId, token, error)
            )
        );
    }

    @JavascriptInterface
    public void syncNotificationConfig(String json) {
        if (json == null || json.length() > 250_000) return;
        PriceWatchScheduler.saveAndSchedule(activity, json);
        AppWidgetUpdater.updateAll(activity);
    }

    @JavascriptInterface
    public void saveLastLocation(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) return;
        if (
            latitude < -90d ||
            latitude > 90d ||
            longitude < -180d ||
            longitude > 180d
        ) {
            return;
        }

        SecureLocalStore.putString(activity, LAST_LATITUDE, Double.toString(latitude));
        SecureLocalStore.putString(activity, LAST_LONGITUDE, Double.toString(longitude));
        SecureLocalStore.putString(
            activity,
            LAST_LOCATION_AT,
            Long.toString(System.currentTimeMillis())
        );
    }

    @JavascriptInterface
    public void saveLocalValue(String key, String value) {
        if (!isAllowedKey(key) || (value != null && value.length() > 500_000)) return;
        SecureLocalStore.putString(activity, key, value == null ? "" : value);
    }

    @JavascriptInterface
    public String getLocalValue(String key) {
        if (!isAllowedKey(key)) return "";
        return SecureLocalStore.getString(activity, key, "");
    }

    @JavascriptInterface
    public void removeLocalValue(String key) {
        if (!isAllowedKey(key)) return;
        SecureLocalStore.remove(activity, key);
    }

    private boolean isAllowedKey(String key) {
        return key != null &&
                key.startsWith("combusplus.") &&
                key.length() <= 120;
    }
}

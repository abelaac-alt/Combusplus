package com.grupomds.combusplus;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

public class WebBridge {
    public static final String CACHE_PREFS = "combusplus_web_cache";
    public static final String LAST_LATITUDE = "combusplus.native.lastLatitude";
    public static final String LAST_LONGITUDE = "combusplus.native.lastLongitude";
    public static final String LAST_LOCATION_AT = "combusplus.native.lastLocationAt";

    private final MainActivity activity;
    private volatile boolean fullTankLaunch;

    public WebBridge(MainActivity activity, boolean fullTankLaunch) {
        this.activity = activity;
        this.fullTankLaunch = fullTankLaunch;
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
    public void requestNotificationPermission() {
        activity.runOnUiThread(activity::requestNotificationPermission);
    }

    @JavascriptInterface
    public void syncNotificationConfig(String json) {
        PriceWatchScheduler.saveAndSchedule(activity, json);
        AppWidgetUpdater.updateAll(activity);
    }

    @JavascriptInterface
    public void saveLastLocation(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) return;
        if (latitude < -90d || latitude > 90d || longitude < -180d || longitude > 180d) return;
        activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(LAST_LATITUDE, Double.doubleToRawLongBits(latitude))
                .putLong(LAST_LONGITUDE, Double.doubleToRawLongBits(longitude))
                .putLong(LAST_LOCATION_AT, System.currentTimeMillis())
                .apply();
    }

    @JavascriptInterface
    public void saveLocalValue(String key, String value) {
        if (!isAllowedKey(key)) return;
        activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)
                .edit().putString(key, value == null ? "" : value).apply();
    }

    @JavascriptInterface
    public String getLocalValue(String key) {
        if (!isAllowedKey(key)) return "";
        SharedPreferences prefs = activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE);
        return prefs.getString(key, "");
    }

    @JavascriptInterface
    public void removeLocalValue(String key) {
        if (!isAllowedKey(key)) return;
        activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE).edit().remove(key).apply();
    }

    private boolean isAllowedKey(String key) {
        return key != null
                && key.startsWith("combusplus.")
                && key.length() <= 120;
    }
}

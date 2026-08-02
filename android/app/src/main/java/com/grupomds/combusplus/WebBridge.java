package com.grupomds.combusplus;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

public class WebBridge {
    private static final String CACHE_PREFS = "combusplus_web_cache";
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
    public void saveLocalValue(String key, String value) {
        if (key == null || key.trim().isEmpty()) return;
        activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)
                .edit().putString(key, value == null ? "" : value).apply();
    }

    @JavascriptInterface
    public String getLocalValue(String key) {
        if (key == null || key.trim().isEmpty()) return "";
        SharedPreferences prefs = activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE);
        return prefs.getString(key, "");
    }

    @JavascriptInterface
    public void removeLocalValue(String key) {
        if (key == null || key.trim().isEmpty()) return;
        activity.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE).edit().remove(key).apply();
    }
}

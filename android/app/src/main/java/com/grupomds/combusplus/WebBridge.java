package com.grupomds.combusplus;

import android.webkit.JavascriptInterface;

public class WebBridge {
    private final MainActivity activity;

    public WebBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(activity::requestNotificationPermission);
    }

    @JavascriptInterface
    public void syncNotificationConfig(String json) {
        PriceWatchScheduler.saveAndSchedule(activity, json);
    }
}

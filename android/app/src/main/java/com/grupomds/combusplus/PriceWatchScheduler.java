package com.grupomds.combusplus;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

public final class PriceWatchScheduler {
    static final String PREFS = "combusplus_native";
    static final String CONFIG = "notification_config";
    private static final String WORK_NAME = "combusplus_price_watch";

    private PriceWatchScheduler() {}

    public static void saveAndSchedule(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CONFIG, json).apply();
        schedule(context, json);
    }

    public static void restore(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(CONFIG, "");
        if (!json.trim().isEmpty()) schedule(context, json);
    }

    private static void schedule(Context context, String json) {
        try {
            JSONObject config = new JSONObject(json);
            boolean enabled = config.optBoolean("enabled", false);
            WorkManager manager = WorkManager.getInstance(context);
            if (!enabled || config.optJSONArray("favorites") == null || config.optJSONArray("favorites").length() == 0) {
                manager.cancelUniqueWork(WORK_NAME);
                return;
            }
            long hours = Math.max(1, config.optLong("intervalHours", 6));
            Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(PriceWatchWorker.class, hours, TimeUnit.HOURS)
                    .setConstraints(constraints)
                    .build();
            manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);
        } catch (Exception ignored) {
        }
    }
}

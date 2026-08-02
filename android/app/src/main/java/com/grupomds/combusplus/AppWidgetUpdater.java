package com.grupomds.combusplus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

public final class AppWidgetUpdater {
    private AppWidgetUpdater() {}

    public static void updateAll(Context context) {
        updateFavoriteWidgets(context);
        updateFullTankWidgets(context);
    }

    public static void updateFavoriteWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FavoritePricesWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, buildFavoriteViews(context));
    }

    public static void updateFullTankWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FullTankWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, buildFullTankViews(context));
    }

    private static RemoteViews buildFavoriteViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_favorite_prices);
        PendingIntent openFavorites = pageIntent(context, "favorites", false, 5100);
        views.setOnClickPendingIntent(R.id.widget_favorites_root, openFavorites);
        views.setOnClickPendingIntent(R.id.widget_favorites_title, openFavorites);

        int[] rowIds = {R.id.favorite_row_1, R.id.favorite_row_2, R.id.favorite_row_3};
        int[] nameIds = {R.id.favorite_name_1, R.id.favorite_name_2, R.id.favorite_name_3};
        int[] priceIds = {R.id.favorite_price_1, R.id.favorite_price_2, R.id.favorite_price_3};
        int[] changeIds = {R.id.favorite_change_1, R.id.favorite_change_2, R.id.favorite_change_3};

        JSONArray favorites = new JSONArray();
        try {
            JSONObject config = new JSONObject(SecureLocalStore.getString(context, PriceWatchScheduler.CONFIG, "{}"));
            JSONArray stored = config.optJSONArray("favorites");
            if (stored != null) favorites = stored;
        } catch (Exception ignored) {}

        for (int i = 0; i < 3; i++) {
            if (i >= favorites.length()) {
                views.setViewVisibility(rowIds[i], View.GONE);
                continue;
            }
            JSONObject favorite = favorites.optJSONObject(i);
            if (favorite == null) {
                views.setViewVisibility(rowIds[i], View.GONE);
                continue;
            }
            views.setViewVisibility(rowIds[i], View.VISIBLE);
            String stationId = favorite.optString("id", "");
            String fuelKey = favorite.optString("watchFuel", "Diesel");
            String priceKey = PriceWatchWorker.pricePreferenceKey(stationId, fuelKey);
            String changeKey = PriceWatchWorker.changePreferenceKey(stationId, fuelKey);
            double fallbackPrice = favorite.optDouble("lastPrice", Double.NaN);
            String storedPrice = SecureLocalStore.getString(context, priceKey, "");
            double price = storedPrice.isEmpty() ? fallbackPrice : parseDouble(storedPrice, fallbackPrice);
            double fallbackChange = favorite.optDouble("lastChange", 0d);
            String storedChange = SecureLocalStore.getString(context, changeKey, "");
            double change = storedChange.isEmpty() ? fallbackChange : parseDouble(storedChange, fallbackChange);

            views.setTextViewText(nameIds[i], favorite.optString("name", "Gasolinera"));
            views.setTextViewText(priceIds[i], Double.isFinite(price) ? formatPrice(price) + " €/l" : "Pendiente");
            if (Math.abs(change) < 0.0005) {
                views.setTextViewText(changeIds[i], "Sin cambios");
                views.setTextColor(changeIds[i], 0xFF6B7078);
            } else if (change < 0) {
                views.setTextViewText(changeIds[i], "▼ " + formatPrice(Math.abs(change)));
                views.setTextColor(changeIds[i], 0xFF0D7A49);
            } else {
                views.setTextViewText(changeIds[i], "▲ " + formatPrice(change));
                views.setTextColor(changeIds[i], 0xFFB3131B);
            }
        }

        views.setViewVisibility(R.id.widget_favorites_empty, favorites.length() == 0 ? View.VISIBLE : View.GONE);
        return views;
    }

    private static RemoteViews buildFullTankViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_full_tank);
        views.setOnClickPendingIntent(R.id.widget_full_tank_root, pageIntent(context, "list", true, 5200));
        views.setOnClickPendingIntent(R.id.widget_full_tank_button, pageIntent(context, "list", true, 5201));
        return views;
    }

    private static PendingIntent pageIntent(Context context, String page, boolean fullTank, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("open_page", page);
        intent.putExtra("auto_full_tank", fullTank);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static double parseDouble(String value, double fallback) {
        try { return Double.parseDouble(value); }
        catch (Exception ignored) { return fallback; }
    }

    private static String formatPrice(double value) {
        return String.format(Locale.forLanguageTag("es-ES"), "%.3f", value);
    }
}

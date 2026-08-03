package com.grupomds.combusplus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

public class FavoritePricesWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_REFRESH =
            "com.grupomds.combusplus.action.REFRESH_FAVORITE_WIDGET";

    @Override
    public void onUpdate(
            Context context,
            AppWidgetManager appWidgetManager,
            int[] appWidgetIds
    ) {
        AppWidgetUpdater.updateFavoriteWidgets(context);
    }

    @Override
    public void onEnabled(Context context) {
        AppWidgetUpdater.updateFavoriteWidgets(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_REFRESH.equals(intent.getAction())) return;

        AppWidgetUpdater.showFavoriteWidgetRefreshing(context);

        OneTimeWorkRequest request =
                new OneTimeWorkRequest.Builder(PriceWatchWorker.class).build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "favorite-widget-manual-refresh",
                ExistingWorkPolicy.REPLACE,
                request
        );
    }
}

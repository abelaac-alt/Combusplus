package com.grupomds.combusplus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class FavoritePricesWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        AppWidgetUpdater.updateFavoriteWidgets(context);
    }

    @Override
    public void onEnabled(Context context) {
        AppWidgetUpdater.updateFavoriteWidgets(context);
    }
}

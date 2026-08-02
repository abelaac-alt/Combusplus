package com.grupomds.combusplus;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class FullTankWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        AppWidgetUpdater.updateFullTankWidgets(context);
    }

    @Override
    public void onEnabled(Context context) {
        AppWidgetUpdater.updateFullTankWidgets(context);
    }
}

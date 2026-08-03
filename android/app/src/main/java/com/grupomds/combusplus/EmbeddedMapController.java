package com.grupomds.combusplus;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.GoogleMapOptions;
import com.google.android.gms.maps.MapView;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.LatLngBounds;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class EmbeddedMapController {
    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView webView;
    private final FrameLayout container;
    private final MapView mapView;
    private final TextView loading;
    private final Map<Marker, String> markerIds = new HashMap<>();

    private GoogleMap map;
    private JSONArray pendingStations = new JSONArray();

    EmbeddedMapController(MainActivity activity, FrameLayout root, WebView webView) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        container = new FrameLayout(activity);
        container.setBackgroundColor(Color.WHITE);
        container.setVisibility(View.GONE);
        container.setElevation(8f);

        GoogleMapOptions options = new GoogleMapOptions()
                .mapToolbarEnabled(false)
                .zoomControlsEnabled(true)
                .compassEnabled(true);

        String mapId = safe(BuildConfig.GOOGLE_MAPS_ANDROID_MAP_ID);
        if (!mapId.isEmpty()) options.mapId(mapId);

        mapView = new MapView(activity, options);
        mapView.onCreate((Bundle) null);
        container.addView(mapView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        loading = new TextView(activity);
        loading.setText("Cargando gasolineras…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(0xCC111318);
        loading.setPadding(22, 16, 22, 16);
        container.addView(loading, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        ));

        root.addView(container);
        mapView.getMapAsync(googleMap -> {
            map = googleMap;
            map.getUiSettings().setMapToolbarEnabled(false);
            map.getUiSettings().setZoomControlsEnabled(true);
            map.getUiSettings().setCompassEnabled(true);
            map.setOnMarkerClickListener(marker -> {
                String id = markerIds.get(marker);
                if (id != null) {
                    hide();
                    activity.openStationFromNative(id);
                    return true;
                }
                return false;
            });
            renderPending();
        });
    }

    void render(String stationsJson, double leftCss, double topCss, double widthCss, double heightCss) {
        try {
            JSONObject payload = new JSONObject(stationsJson);
            pendingStations = payload.optJSONArray("items");
            if (pendingStations == null) pendingStations = new JSONArray();

            position(leftCss, topCss, widthCss, heightCss);
            container.setVisibility(View.VISIBLE);
            mapView.onStart();
            mapView.onResume();
            renderPending();
        } catch (Exception error) {
            loading.setText("No se pudo preparar el mapa.");
            container.setVisibility(View.VISIBLE);
        }
    }

    private void position(double leftCss, double topCss, double widthCss, double heightCss) {
        float scale = webView.getScale();
        if (!Float.isFinite(scale) || scale <= 0f) {
            scale = activity.getResources().getDisplayMetrics().density;
        }

        int left = webView.getLeft() + Math.max(0, Math.round((float) leftCss * scale));
        int top = webView.getTop() + Math.max(0, Math.round((float) topCss * scale));
        int width = Math.max(1, Math.round((float) widthCss * scale));
        int height = Math.max(220, Math.round((float) heightCss * scale));

        width = Math.min(width, Math.max(1, root.getWidth() - left));
        height = Math.min(height, Math.max(1, root.getHeight() - top));

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height);
        params.leftMargin = left;
        params.topMargin = top;
        container.setLayoutParams(params);
        container.bringToFront();
    }

    private void renderPending() {
        if (map == null) return;

        map.clear();
        markerIds.clear();

        LatLngBounds.Builder bounds = new LatLngBounds.Builder();
        boolean hasBounds = false;
        int added = 0;

        for (int index = 0; index < pendingStations.length(); index++) {
            JSONObject item = pendingStations.optJSONObject(index);
            if (item == null) continue;

            double latitude = item.optDouble("latitude", Double.NaN);
            double longitude = item.optDouble("longitude", Double.NaN);
            if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) continue;

            String id = item.optString("id", "");
            String name = item.optString("name", "Gasolinera");
            String price = item.optString("price", "");
            String status = item.optString("status", "");
            String address = item.optString("address", "");

            Marker marker = map.addMarker(new MarkerOptions()
                    .position(new LatLng(latitude, longitude))
                    .title(name)
                    .snippet(join(price, status, address)));
            if (marker != null && !id.isEmpty()) markerIds.put(marker, id);

            bounds.include(new LatLng(latitude, longitude));
            hasBounds = true;
            added++;
        }

        loading.setText(added == 0
                ? "Realiza una búsqueda para mostrar gasolineras."
                : added + " gasolineras · toca un marcador para ver toda la información");
        loading.setVisibility(added == 0 ? View.VISIBLE : View.GONE);

        if (hasBounds) {
            try {
                map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), 90));
            } catch (Exception ignored) {
            }
        }
    }

    void hide() {
        if (container.getVisibility() == View.VISIBLE) {
            mapView.onPause();
            mapView.onStop();
            container.setVisibility(View.GONE);
        }
    }

    void onResume() {
        if (container.getVisibility() == View.VISIBLE) mapView.onResume();
    }

    void onPause() {
        if (container.getVisibility() == View.VISIBLE) mapView.onPause();
    }

    void destroy() {
        mapView.onDestroy();
    }

    private static String join(String... values) {
        StringBuilder result = new StringBuilder();
        for (String value : values) {
            if (value == null || value.trim().isEmpty()) continue;
            if (result.length() > 0) result.append(" · ");
            result.append(value.trim());
        }
        return result.toString();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}

package com.grupomds.combusplus;

import android.graphics.Color;
import android.graphics.Outline;
import android.os.Bundle;
import android.view.View;
import android.view.ViewOutlineProvider;
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
    private boolean started = false;

    EmbeddedMapController(
            MainActivity activity,
            FrameLayout root,
            WebView webView
    ) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        container = new FrameLayout(activity);
        container.setBackgroundColor(Color.WHITE);
        container.setVisibility(View.GONE);
        container.setElevation(0f);
        container.setClipToOutline(true);
        container.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                float density = activity.getResources()
                        .getDisplayMetrics()
                        .density;
                outline.setRoundRect(
                        0,
                        0,
                        view.getWidth(),
                        view.getHeight(),
                        10f * density
                );
            }
        });

        GoogleMapOptions options = new GoogleMapOptions()
                .mapToolbarEnabled(false)
                .zoomControlsEnabled(true)
                .compassEnabled(true)
                .scrollGesturesEnabled(true)
                .zoomGesturesEnabled(true)
                .rotateGesturesEnabled(true)
                .tiltGesturesEnabled(true);

        String mapId = safe(BuildConfig.GOOGLE_MAPS_ANDROID_MAP_ID);
        if (!mapId.isEmpty()) {
            options.mapId(mapId);
        }

        mapView = new MapView(activity, options);
        mapView.onCreate((Bundle) null);
        container.addView(
                mapView,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        loading = new TextView(activity);
        loading.setText("Cargando gasolineras…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(0xCC111318);
        loading.setPadding(22, 16, 22, 16);
        container.addView(
                loading,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT
                )
        );

        root.addView(container);

        mapView.getMapAsync(googleMap -> {
            map = googleMap;
            map.getUiSettings().setMapToolbarEnabled(false);
            map.getUiSettings().setZoomControlsEnabled(true);
            map.getUiSettings().setCompassEnabled(true);

            map.setOnMarkerClickListener(marker -> {
                String id = markerIds.get(marker);
                if (id != null) {
                    activity.openStationFromNative(id);
                    return true;
                }
                return false;
            });

            renderPending();
        });
    }

    void render(
            String stationsJson,
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss
    ) {
        try {
            JSONObject payload = new JSONObject(stationsJson);
            JSONArray items = payload.optJSONArray("items");
            pendingStations = items == null ? new JSONArray() : items;

            if (!position(leftCss, topCss, widthCss, heightCss)) {
                hide();
                return;
            }

            if (!started) {
                mapView.onStart();
                started = true;
            }

            mapView.onResume();
            container.setVisibility(View.VISIBLE);
            container.bringToFront();
            renderPending();
        } catch (Exception error) {
            loading.setText("No se pudo preparar el mapa.");
            container.setVisibility(View.VISIBLE);
        }
    }

    private boolean position(
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss
    ) {
        /*
         * getBoundingClientRect() devuelve píxeles CSS relativos al viewport
         * visible del WebView. Android trabaja con píxeles físicos.
         * La conversión correcta es mediante density, no WebView.getScale().
         */
        float density = activity.getResources()
                .getDisplayMetrics()
                .density;

        int left = webView.getLeft()
                + Math.round((float) leftCss * density);
        int top = webView.getTop()
                + Math.round((float) topCss * density);
        int width = Math.max(
                1,
                Math.round((float) widthCss * density)
        );
        int height = Math.max(
                Math.round(300f * density),
                Math.round((float) heightCss * density)
        );

        int viewportLeft = webView.getLeft();
        int viewportTop = webView.getTop();
        int viewportRight = viewportLeft + webView.getWidth();
        int viewportBottom = viewportTop + webView.getHeight();

        int right = left + width;
        int bottom = top + height;

        // Si el recuadro ya no está visible en la pantalla, el mapa se oculta.
        if (
                right <= viewportLeft ||
                left >= viewportRight ||
                bottom <= viewportTop ||
                top >= viewportBottom
        ) {
            return false;
        }

        // Recorta exactamente al área visible del recuadro.
        int clippedLeft = Math.max(left, viewportLeft);
        int clippedTop = Math.max(top, viewportTop);
        int clippedRight = Math.min(right, viewportRight);
        int clippedBottom = Math.min(bottom, viewportBottom);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                Math.max(1, clippedRight - clippedLeft),
                Math.max(1, clippedBottom - clippedTop)
        );
        params.leftMargin = clippedLeft;
        params.topMargin = clippedTop;
        container.setLayoutParams(params);

        /*
         * Compensa el recorte superior o lateral desplazando internamente
         * el MapView. Así el contenido no "salta" al hacer scroll.
         */
        FrameLayout.LayoutParams mapParams = new FrameLayout.LayoutParams(
                width,
                height
        );
        mapParams.leftMargin = left - clippedLeft;
        mapParams.topMargin = top - clippedTop;
        mapView.setLayoutParams(mapParams);

        container.invalidateOutline();
        return true;
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

            if (
                    !Double.isFinite(latitude) ||
                    !Double.isFinite(longitude)
            ) {
                continue;
            }

            String id = item.optString("id", "");
            String name = item.optString("name", "Gasolinera");
            String price = item.optString("price", "");
            String status = item.optString("status", "");
            String address = item.optString("address", "");

            Marker marker = map.addMarker(
                    new MarkerOptions()
                            .position(new LatLng(latitude, longitude))
                            .title(name)
                            .snippet(join(price, status, address))
            );

            if (marker != null && !id.isEmpty()) {
                markerIds.put(marker, id);
            }

            bounds.include(new LatLng(latitude, longitude));
            hasBounds = true;
            added++;
        }

        loading.setText(
                added == 0
                        ? "Realiza una búsqueda para mostrar gasolineras."
                        : added + " gasolineras · toca un marcador para ver toda la información"
        );
        loading.setVisibility(
                added == 0 ? View.VISIBLE : View.GONE
        );

        if (hasBounds) {
            container.post(() -> {
                try {
                    map.animateCamera(
                            CameraUpdateFactory.newLatLngBounds(
                                    bounds.build(),
                                    Math.round(
                                            72f * activity.getResources()
                                                    .getDisplayMetrics()
                                                    .density
                                    )
                            )
                    );
                } catch (Exception ignored) {
                }
            });
        }
    }

    void hide() {
        if (container.getVisibility() == View.VISIBLE) {
            mapView.onPause();
            container.setVisibility(View.GONE);
        }
    }

    void onResume() {
        if (container.getVisibility() == View.VISIBLE) {
            if (!started) {
                mapView.onStart();
                started = true;
            }
            mapView.onResume();
        }
    }

    void onPause() {
        if (container.getVisibility() == View.VISIBLE) {
            mapView.onPause();
        }
    }

    void destroy() {
        if (started) {
            mapView.onStop();
            started = false;
        }
        mapView.onDestroy();
    }

    private static String join(String... values) {
        StringBuilder result = new StringBuilder();

        for (String value : values) {
            if (value == null || value.trim().isEmpty()) continue;

            if (result.length() > 0) {
                result.append(" · ");
            }
            result.append(value.trim());
        }

        return result.toString();
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }
}

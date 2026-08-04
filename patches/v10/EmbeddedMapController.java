package com.grupomds.combusplus;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Paint;
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
import com.google.android.gms.maps.model.BitmapDescriptor;
import com.google.android.gms.maps.model.BitmapDescriptorFactory;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.LatLngBounds;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

final class EmbeddedMapController {
    private static final int NAV_RESERVED_DP = 78;
    private static final int BORDER_DP = 3;

    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView webView;
    private final FrameLayout container;
    private final MapView mapView;
    private final TextView loading;
    private final Map<Marker, String> markerIds = new HashMap<>();
    private final Map<String, BitmapDescriptor> markerCache = new HashMap<>();

    private GoogleMap map;
    private JSONArray pendingStations = new JSONArray();
    private boolean started;
    private int lastPayloadHash;
    private int lastLeft = Integer.MIN_VALUE;
    private int lastTop = Integer.MIN_VALUE;
    private int lastWidth = -1;
    private int lastHeight = -1;
    private int lastInnerLeft = Integer.MIN_VALUE;
    private int lastInnerTop = Integer.MIN_VALUE;
    private int lastInnerWidth = -1;
    private int lastInnerHeight = -1;

    EmbeddedMapController(
            MainActivity activity,
            FrameLayout root,
            WebView webView
    ) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        container = new FrameLayout(activity);
        container.setBackgroundColor(0xFFD1131B);
        container.setVisibility(View.GONE);
        container.setElevation(0f);
        container.setClipChildren(true);
        container.setClipToPadding(true);
        container.setClipToOutline(true);
        container.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(
                        0,
                        0,
                        view.getWidth(),
                        view.getHeight(),
                        dp(16)
                );
            }
        });

        GoogleMapOptions options = new GoogleMapOptions()
                .mapToolbarEnabled(false)
                .zoomControlsEnabled(true)
                .compassEnabled(true)
                .scrollGesturesEnabled(true)
                .zoomGesturesEnabled(true)
                .rotateGesturesEnabled(false)
                .tiltGesturesEnabled(false);

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
        loading.setPadding(dp(14), dp(9), dp(14), dp(9));
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
            map.getUiSettings().setMyLocationButtonEnabled(false);
            map.getUiSettings().setRotateGesturesEnabled(false);
            map.getUiSettings().setTiltGesturesEnabled(false);

            map.setOnMarkerClickListener(marker -> {
                String id = markerIds.get(marker);
                if (id == null) return false;

                hide();
                activity.openStationFromNative(id);
                return true;
            });

            renderMarkers(true);
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

            if (!positionExactly(
                    leftCss,
                    topCss,
                    widthCss,
                    heightCss
            )) {
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

            int hash = stationsJson.hashCode();
            boolean changed = hash != lastPayloadHash;
            lastPayloadHash = hash;
            renderMarkers(changed);
        } catch (Exception error) {
            loading.setText("No se pudo preparar el mapa.");
            loading.setVisibility(View.VISIBLE);
            container.setVisibility(View.VISIBLE);
        }
    }

    private boolean positionExactly(
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss
    ) {
        /*
         * El mapa nativo se dibuja sobre el WebView. Se recorta físicamente
         * antes del menú inferior y se mantiene alineado con el rectángulo
         * real del mapa HTML durante el scroll.
         */
        float scale = webView.getScale();
        if (!Float.isFinite(scale) || scale <= 0f) {
            scale = activity.getResources()
                    .getDisplayMetrics()
                    .density;
        }

        int fullLeft =
                webView.getLeft() +
                Math.round((float) leftCss * scale);
        int fullTop =
                webView.getTop() +
                Math.round((float) topCss * scale);
        int fullWidth = Math.max(
                dp(180),
                Math.round((float) widthCss * scale)
        );
        int fullHeight = Math.max(
                dp(220),
                Math.round((float) heightCss * scale)
        );

        int viewportLeft = webView.getLeft();
        int viewportTop = webView.getTop();
        int viewportRight =
                webView.getLeft() + webView.getWidth();
        int viewportBottom =
                webView.getTop() +
                webView.getHeight() -
                dp(NAV_RESERVED_DP);

        int fullRight = fullLeft + fullWidth;
        int fullBottom = fullTop + fullHeight;

        int clippedLeft = Math.max(fullLeft, viewportLeft);
        int clippedTop = Math.max(fullTop, viewportTop);
        int clippedRight = Math.min(fullRight, viewportRight);
        int clippedBottom = Math.min(fullBottom, viewportBottom);

        if (
                clippedRight <= clippedLeft ||
                clippedBottom <= clippedTop
        ) {
            return false;
        }

        int visibleWidth = clippedRight - clippedLeft;
        int visibleHeight = clippedBottom - clippedTop;

        if (
                clippedLeft != lastLeft ||
                clippedTop != lastTop ||
                visibleWidth != lastWidth ||
                visibleHeight != lastHeight
        ) {
            FrameLayout.LayoutParams outerLayout =
                    new FrameLayout.LayoutParams(
                            visibleWidth,
                            visibleHeight
                    );
            outerLayout.leftMargin = clippedLeft;
            outerLayout.topMargin = clippedTop;
            container.setLayoutParams(outerLayout);

            lastLeft = clippedLeft;
            lastTop = clippedTop;
            lastWidth = visibleWidth;
            lastHeight = visibleHeight;
            container.invalidateOutline();
        }

        int border = dp(BORDER_DP);
        int innerLeft = fullLeft - clippedLeft + border;
        int innerTop = fullTop - clippedTop + border;
        int innerWidth = Math.max(1, fullWidth - border * 2);
        int innerHeight = Math.max(1, fullHeight - border * 2);

        if (
                innerLeft != lastInnerLeft ||
                innerTop != lastInnerTop ||
                innerWidth != lastInnerWidth ||
                innerHeight != lastInnerHeight
        ) {
            FrameLayout.LayoutParams innerLayout =
                    new FrameLayout.LayoutParams(
                            innerWidth,
                            innerHeight
                    );
            innerLayout.leftMargin = innerLeft;
            innerLayout.topMargin = innerTop;
            mapView.setLayoutParams(innerLayout);

            lastInnerLeft = innerLeft;
            lastInnerTop = innerTop;
            lastInnerWidth = innerWidth;
            lastInnerHeight = innerHeight;
        }

        return true;
    }

    private void renderMarkers(boolean changed) {
        if (map == null || !changed) return;

        map.clear();
        markerIds.clear();

        LatLngBounds.Builder bounds = new LatLngBounds.Builder();
        boolean hasBounds = false;
        int added = 0;

        for (
                int index = 0;
                index < pendingStations.length();
                index++
        ) {
            JSONObject item = pendingStations.optJSONObject(index);
            if (item == null) continue;

            double latitude =
                    item.optDouble("latitude", Double.NaN);
            double longitude =
                    item.optDouble("longitude", Double.NaN);

            if (
                    !Double.isFinite(latitude) ||
                    !Double.isFinite(longitude)
            ) {
                continue;
            }

            String id = item.optString("id", "");
            String name =
                    item.optString("name", "Gasolinera");
            String price = normalizePriceLabel(
                    item.optString("price", "")
            );
            String status = item.optString("status", "");
            String address = item.optString("address", "");
            boolean favorite =
                    item.optBoolean("favorite", false);

            Marker marker = map.addMarker(
                    new MarkerOptions()
                            .position(
                                    new LatLng(
                                            latitude,
                                            longitude
                                    )
                            )
                            .title(name)
                            .snippet(
                                    join(
                                            price,
                                            status,
                                            address
                                    )
                            )
                            .anchor(0.5f, 0.5f)
                            .icon(
                                    priceMarker(
                                            price,
                                            favorite
                                    )
                            )
                            .zIndex(
                                    favorite ? 10f : 1f
                            )
            );

            if (marker != null && !id.isEmpty()) {
                markerIds.put(marker, id);
            }

            bounds.include(
                    new LatLng(latitude, longitude)
            );
            hasBounds = true;
            added++;
        }

        loading.setText(
                added == 0
                        ? "No hay gasolineras en esta zona."
                        : added + " gasolineras"
        );
        loading.setVisibility(
                added == 0 ? View.VISIBLE : View.GONE
        );

        if (hasBounds) {
            container.post(() -> {
                try {
                    map.moveCamera(
                            CameraUpdateFactory
                                    .newLatLngBounds(
                                            bounds.build(),
                                            dp(38)
                                    )
                    );
                } catch (Exception ignored) {
                }
            });
        }
    }

    private BitmapDescriptor priceMarker(
            String price,
            boolean favorite
    ) {
        String label = price.isEmpty() ? "—" : price;
        String key =
                (favorite ? "fav|" : "normal|") + label;

        BitmapDescriptor cached = markerCache.get(key);
        if (cached != null) return cached;

        int size = dp(58);
        Bitmap bitmap = Bitmap.createBitmap(
                size,
                size,
                Bitmap.Config.ARGB_8888
        );
        Canvas canvas = new Canvas(bitmap);

        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(0x33000000);
        canvas.drawCircle(
                size / 2f,
                size / 2f + dp(1),
                size / 2f - dp(2),
                shadow
        );

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(
                favorite ? 0xFFFFC107 : 0xFFD71920
        );
        canvas.drawCircle(
                size / 2f,
                size / 2f,
                size / 2f - dp(3),
                fill
        );

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(dp(2));
        border.setColor(Color.WHITE);
        canvas.drawCircle(
                size / 2f,
                size / 2f,
                size / 2f - dp(3),
                border
        );

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(
                favorite ? 0xFF16181C : Color.WHITE
        );
        text.setTextAlign(Paint.Align.CENTER);
        text.setFakeBoldText(true);
        text.setTextSize(
                dp(label.length() > 7 ? 10 : 11)
        );

        Paint.FontMetrics metrics =
                text.getFontMetrics();
        float baseline =
                size / 2f -
                (metrics.ascent + metrics.descent) / 2f;

        canvas.drawText(
                label,
                size / 2f,
                baseline,
                text
        );

        BitmapDescriptor descriptor =
                BitmapDescriptorFactory.fromBitmap(bitmap);
        markerCache.put(key, descriptor);
        return descriptor;
    }

    private String normalizePriceLabel(String value) {
        String text = safe(value)
                .replace("€/l", "")
                .replace("€", "")
                .trim();

        if (
                text.isEmpty() ||
                "Sin precio".equalsIgnoreCase(text)
        ) {
            return "—";
        }

        try {
            double number = Double.parseDouble(
                    text.replace(",", ".")
            );
            return String.format(
                    Locale.forLanguageTag("es-ES"),
                    "%.3f€",
                    number
            );
        } catch (Exception ignored) {
            return text.length() > 8
                    ? text.substring(0, 8)
                    : text;
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
        markerCache.clear();
    }

    private int dp(int value) {
        return Math.round(
                value *
                activity.getResources()
                        .getDisplayMetrics()
                        .density
        );
    }

    private static String join(String... values) {
        StringBuilder result = new StringBuilder();
        for (String value : values) {
            if (
                    value == null ||
                    value.trim().isEmpty()
            ) {
                continue;
            }

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

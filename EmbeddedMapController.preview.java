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
    private final MainActivity activity;
    private final FrameLayout root;
    private final WebView webView;
    private final FrameLayout clipContainer;
    private final MapView mapView;
    private final TextView loading;
    private final Map<Marker, String> markerIds = new HashMap<>();
    private final Map<String, BitmapDescriptor> markerCache = new HashMap<>();

    private GoogleMap map;
    private JSONArray pendingStations = new JSONArray();
    private boolean started;
    private int lastPayloadHash;
    private int lastClipLeft = Integer.MIN_VALUE;
    private int lastClipTop = Integer.MIN_VALUE;
    private int lastClipWidth = -1;
    private int lastClipHeight = -1;
    private int lastMapLeft = Integer.MIN_VALUE;
    private int lastMapTop = Integer.MIN_VALUE;
    private int lastMapWidth = -1;
    private int lastMapHeight = -1;

    EmbeddedMapController(
            MainActivity activity,
            FrameLayout root,
            WebView webView
    ) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        clipContainer = new FrameLayout(activity);
        clipContainer.setBackgroundColor(Color.TRANSPARENT);
        clipContainer.setVisibility(View.GONE);
        clipContainer.setElevation(0f);
        clipContainer.setClipChildren(true);
        clipContainer.setClipToPadding(true);
        clipContainer.setClipToOutline(true);
        clipContainer.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(
                        0,
                        0,
                        view.getWidth(),
                        view.getHeight(),
                        dp(13)
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
        clipContainer.addView(mapView);

        loading = new TextView(activity);
        loading.setText("Cargando gasolineras…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(0xCC111318);
        loading.setPadding(dp(14), dp(9), dp(14), dp(9));
        clipContainer.addView(
                loading,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT
                )
        );

        root.addView(clipContainer);

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
        double density = activity.getResources()
                .getDisplayMetrics()
                .density;
        double viewportWidthCss = webView.getWidth() / Math.max(1d, density);
        double navTopCss = webView.getHeight() / Math.max(1d, density);
        renderV2(
                stationsJson,
                leftCss,
                topCss,
                widthCss,
                heightCss,
                viewportWidthCss,
                navTopCss
        );
    }

    void renderV2(
            String stationsJson,
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss,
            double viewportWidthCss,
            double navTopCss
    ) {
        try {
            JSONObject payload = new JSONObject(stationsJson);
            JSONArray items = payload.optJSONArray("items");
            pendingStations = items == null ? new JSONArray() : items;

            if (!positionInsideViewport(
                    leftCss,
                    topCss,
                    widthCss,
                    heightCss,
                    viewportWidthCss,
                    navTopCss
            )) {
                hide();
                return;
            }

            if (!started) {
                mapView.onStart();
                started = true;
            }

            mapView.onResume();
            clipContainer.setVisibility(View.VISIBLE);
            clipContainer.bringToFront();

            int hash = stationsJson.hashCode();
            boolean changed = hash != lastPayloadHash;
            lastPayloadHash = hash;
            renderMarkers(changed);
        } catch (Exception error) {
            loading.setText("No se pudo preparar el mapa.");
            loading.setVisibility(View.VISIBLE);
            clipContainer.setVisibility(View.VISIBLE);
        }
    }

    private boolean positionInsideViewport(
            double leftCss,
            double topCss,
            double widthCss,
            double heightCss,
            double viewportWidthCss,
            double navTopCss
    ) {
        if (!Double.isFinite(viewportWidthCss) || viewportWidthCss <= 0d) {
            return false;
        }

        /*
         * La escala se obtiene comparando el ancho real del WebView con el
         * ancho CSS comunicado por JavaScript. Así no depende del zoom,
         * densidad ni modelo del móvil.
         */
        double scale = webView.getWidth() / viewportWidthCss;
        if (!Double.isFinite(scale) || scale <= 0d) return false;

        int mapLeft = webView.getLeft() + px(leftCss, scale);
        int mapTop = webView.getTop() + px(topCss, scale);
        int mapWidth = Math.max(dp(180), px(widthCss, scale));
        int mapHeight = Math.max(dp(220), px(heightCss, scale));

        int viewportLeft = webView.getLeft();
        int viewportTop = webView.getTop();
        int viewportRight = viewportLeft + webView.getWidth();
        int webViewBottom = viewportTop + webView.getHeight();

        int navigationTop = webViewBottom;
        if (Double.isFinite(navTopCss) && navTopCss > 0d) {
            navigationTop = Math.min(
                    webViewBottom,
                    webView.getTop() + px(navTopCss, scale)
            );
        }

        int mapRight = mapLeft + mapWidth;
        int mapBottom = mapTop + mapHeight;

        int clipLeft = Math.max(mapLeft, viewportLeft);
        int clipTop = Math.max(mapTop, viewportTop);
        int clipRight = Math.min(mapRight, viewportRight);
        int clipBottom = Math.min(mapBottom, navigationTop - dp(1));

        if (clipRight <= clipLeft || clipBottom <= clipTop) {
            return false;
        }

        int clipWidth = clipRight - clipLeft;
        int clipHeight = clipBottom - clipTop;

        if (
                clipLeft != lastClipLeft ||
                clipTop != lastClipTop ||
                clipWidth != lastClipWidth ||
                clipHeight != lastClipHeight
        ) {
            FrameLayout.LayoutParams clipLayout =
                    new FrameLayout.LayoutParams(clipWidth, clipHeight);
            clipLayout.leftMargin = clipLeft;
            clipLayout.topMargin = clipTop;
            clipContainer.setLayoutParams(clipLayout);

            lastClipLeft = clipLeft;
            lastClipTop = clipTop;
            lastClipWidth = clipWidth;
            lastClipHeight = clipHeight;
            clipContainer.invalidateOutline();
        }

        int innerLeft = mapLeft - clipLeft;
        int innerTop = mapTop - clipTop;

        if (
                innerLeft != lastMapLeft ||
                innerTop != lastMapTop ||
                mapWidth != lastMapWidth ||
                mapHeight != lastMapHeight
        ) {
            FrameLayout.LayoutParams mapLayout =
                    new FrameLayout.LayoutParams(mapWidth, mapHeight);
            mapLayout.leftMargin = innerLeft;
            mapLayout.topMargin = innerTop;
            mapView.setLayoutParams(mapLayout);

            lastMapLeft = innerLeft;
            lastMapTop = innerTop;
            lastMapWidth = mapWidth;
            lastMapHeight = mapHeight;
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

        for (int index = 0; index < pendingStations.length(); index++) {
            JSONObject item = pendingStations.optJSONObject(index);
            if (item == null) continue;

            double latitude = item.optDouble("latitude", Double.NaN);
            double longitude = item.optDouble("longitude", Double.NaN);
            if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) {
                continue;
            }

            String id = item.optString("id", "");
            String name = item.optString("name", "Gasolinera");
            String price = normalizePriceLabel(item.optString("price", ""));
            String status = item.optString("status", "");
            String address = item.optString("address", "");
            boolean favorite = item.optBoolean("favorite", false);

            Marker marker = map.addMarker(
                    new MarkerOptions()
                            .position(new LatLng(latitude, longitude))
                            .title(name)
                            .snippet(join(price, status, address))
                            .anchor(0.5f, 0.5f)
                            .icon(priceMarker(price, favorite))
                            .zIndex(favorite ? 10f : 1f)
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
                        ? "No hay gasolineras en esta zona."
                        : added + " gasolineras"
        );
        loading.setVisibility(added == 0 ? View.VISIBLE : View.GONE);

        if (hasBounds) {
            clipContainer.post(() -> {
                try {
                    map.moveCamera(
                            CameraUpdateFactory.newLatLngBounds(
                                    bounds.build(),
                                    dp(38)
                            )
                    );
                } catch (Exception ignored) {
                }
            });
        }
    }

    private BitmapDescriptor priceMarker(String price, boolean favorite) {
        String label = price.isEmpty() ? "—" : price;
        String key = (favorite ? "fav|" : "normal|") + label;
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
        fill.setColor(favorite ? 0xFFFFC107 : 0xFFD71920);
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
        text.setColor(favorite ? 0xFF16181C : Color.WHITE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setFakeBoldText(true);
        text.setTextSize(dp(label.length() > 7 ? 10 : 11));

        Paint.FontMetrics metrics = text.getFontMetrics();
        float baseline =
                size / 2f -
                (metrics.ascent + metrics.descent) / 2f;
        canvas.drawText(label, size / 2f, baseline, text);

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

        if (text.isEmpty() || "Sin precio".equalsIgnoreCase(text)) {
            return "—";
        }

        try {
            double number = Double.parseDouble(text.replace(",", "."));
            return String.format(
                    Locale.forLanguageTag("es-ES"),
                    "%.3f€",
                    number
            );
        } catch (Exception ignored) {
            return text.length() > 8 ? text.substring(0, 8) : text;
        }
    }

    void hide() {
        if (clipContainer.getVisibility() == View.VISIBLE) {
            mapView.onPause();
            clipContainer.setVisibility(View.GONE);
        }
    }

    void onResume() {
        if (clipContainer.getVisibility() == View.VISIBLE) {
            if (!started) {
                mapView.onStart();
                started = true;
            }
            mapView.onResume();
        }
    }

    void onPause() {
        if (clipContainer.getVisibility() == View.VISIBLE) {
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

    private int px(double cssPixels, double scale) {
        return (int) Math.round(cssPixels * scale);
    }

    private int dp(int value) {
        return Math.round(
                value * activity.getResources().getDisplayMetrics().density
        );
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

package com.grupomds.combusplus;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.RectF;
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
    private final FrameLayout container;
    private final MapView mapView;
    private final TextView loading;
    private final Map<Marker, String> markerIds = new HashMap<>();
    private final Map<String, BitmapDescriptor> markerCache = new HashMap<>();

    private GoogleMap map;
    private JSONArray pendingStations = new JSONArray();
    private boolean started = false;
    private int lastPayloadHash = 0;
    private int lastLeft = Integer.MIN_VALUE;
    private int lastTop = Integer.MIN_VALUE;
    private int lastWidth = -1;
    private int lastHeight = -1;

    EmbeddedMapController(MainActivity activity, FrameLayout root, WebView webView) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        container = new FrameLayout(activity);
        container.setBackgroundColor(Color.TRANSPARENT);
        container.setPadding(0, 0, 0, 0);
        container.setVisibility(View.GONE);
        container.setElevation(0f);
        container.setClipChildren(true);
        container.setClipToPadding(true);
        container.setClipToOutline(true);
        container.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(14));
            }
        });

        GoogleMapOptions options = new GoogleMapOptions()
                .mapToolbarEnabled(false)
                .zoomControlsEnabled(true)
                .compassEnabled(true)
                .scrollGesturesEnabled(true)
                .zoomGesturesEnabled(true)
                .rotateGesturesEnabled(false)
                .tiltGesturesEnabled(false)
                .liteMode(false);

        String mapId = safe(BuildConfig.GOOGLE_MAPS_ANDROID_MAP_ID);
        if (!mapId.isEmpty()) options.mapId(mapId);

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
        loading.setText("Buscando gasolineras…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(0xCC111318);
        loading.setPadding(dp(14), dp(10), dp(14), dp(10));
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
                if (id != null) {
                    hide();
                    activity.openStationFromNative(id);
                    return true;
                }
                return false;
            });

            renderMarkersIfNeeded(true);
        });
    }

    void render(String stationsJson, double leftCss, double topCss, double widthCss, double heightCss) {
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

            int payloadHash = stationsJson.hashCode();
            boolean changed = payloadHash != lastPayloadHash;
            lastPayloadHash = payloadHash;
            renderMarkersIfNeeded(changed);
        } catch (Exception error) {
            loading.setText("No se pudo preparar el mapa.");
            loading.setVisibility(View.VISIBLE);
            container.setVisibility(View.VISIBLE);
        }
    }

    private boolean position(double leftCss, double topCss, double widthCss, double heightCss) {
        float density = activity.getResources().getDisplayMetrics().density;

        int left = webView.getLeft() + Math.round((float) leftCss * density);
        int top = webView.getTop() + Math.round((float) topCss * density);
        int width = Math.max(dp(220), Math.round((float) widthCss * density));
        int height = Math.max(dp(320), Math.round((float) heightCss * density));

        int viewportLeft = webView.getLeft();
        int viewportTop = webView.getTop();
        int viewportRight = viewportLeft + webView.getWidth();
        int viewportBottom = viewportTop + webView.getHeight();

        int right = left + width;
        int bottom = top + height;

        if (right <= viewportLeft || left >= viewportRight || bottom <= viewportTop || top >= viewportBottom) {
            return false;
        }

        int clippedLeft = Math.max(left, viewportLeft);
        int clippedTop = Math.max(top, viewportTop);
        int clippedRight = Math.min(right, viewportRight);
        int clippedBottom = Math.min(bottom, viewportBottom);

        int containerWidth = Math.max(1, clippedRight - clippedLeft);
        int containerHeight = Math.max(1, clippedBottom - clippedTop);

        if (clippedLeft != lastLeft || clippedTop != lastTop || containerWidth != lastWidth || containerHeight != lastHeight) {
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(containerWidth, containerHeight);
            params.leftMargin = clippedLeft;
            params.topMargin = clippedTop;
            container.setLayoutParams(params);

            FrameLayout.LayoutParams mapParams = new FrameLayout.LayoutParams(width, height);
            mapParams.leftMargin = left - clippedLeft;
            mapParams.topMargin = top - clippedTop;
            mapView.setLayoutParams(mapParams);

            lastLeft = clippedLeft;
            lastTop = clippedTop;
            lastWidth = containerWidth;
            lastHeight = containerHeight;
            container.invalidateOutline();
        }

        return true;
    }

    private void renderMarkersIfNeeded(boolean changed) {
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
            if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) continue;

            String id = item.optString("id", "");
            String name = item.optString("name", "Gasolinera");
            String price = normalizePrice(item.optString("price", ""));
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

            if (marker != null && !id.isEmpty()) markerIds.put(marker, id);
            bounds.include(new LatLng(latitude, longitude));
            hasBounds = true;
            added++;
        }

        loading.setText(added == 0 ? "No se encontraron gasolineras con estos filtros." : added + " gasolineras en el mapa");
        loading.setVisibility(added == 0 ? View.VISIBLE : View.GONE);

        if (hasBounds) {
            container.post(() -> {
                try {
                    map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), dp(44)));
                } catch (Exception ignored) {
                }
            });
        }
    }

    private BitmapDescriptor priceMarker(String price, boolean favorite) {
        String key = (favorite ? "f:" : "n:") + price;
        BitmapDescriptor cached = markerCache.get(key);
        if (cached != null) return cached;

        int diameter = dp(58);
        int bitmapSize = dp(66);
        Bitmap bitmap = Bitmap.createBitmap(bitmapSize, bitmapSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        float center = bitmapSize / 2f;
        float radius = diameter / 2f;

        paint.setColor(favorite ? 0xFFFFC107 : 0xFFD1131B);
        canvas.drawCircle(center, center, radius, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(dp(3));
        paint.setColor(Color.WHITE);
        canvas.drawCircle(center, center, radius - dp(1.5f), paint);
        paint.setStyle(Paint.Style.FILL);

        paint.setColor(favorite ? 0xFF111318 : Color.WHITE);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setFakeBoldText(true);
        paint.setTextSize(price.length() > 7 ? dp(12) : dp(14));

        Paint.FontMetrics metrics = paint.getFontMetrics();
        float baseline = center - (metrics.ascent + metrics.descent) / 2f;
        canvas.drawText(price.isEmpty() ? "—" : price, center, baseline, paint);

        BitmapDescriptor descriptor = BitmapDescriptorFactory.fromBitmap(bitmap);
        markerCache.put(key, descriptor);
        return descriptor;
    }

    private String normalizePrice(String raw) {
        String value = safe(raw)
                .replace("€/l", "")
                .replace("€", "")
                .trim();
        if (value.isEmpty()) return "—";
        try {
            double number = Double.parseDouble(value.replace(',', '.'));
            return String.format(Locale.US, "%.3f€", number).replace('.', ',');
        } catch (Exception ignored) {
            return value.length() > 8 ? value.substring(0, 8) : value;
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
        if (container.getVisibility() == View.VISIBLE) mapView.onPause();
    }

    void destroy() {
        if (started) {
            mapView.onStop();
            started = false;
        }
        markerCache.clear();
        mapView.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private int dp(float value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
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

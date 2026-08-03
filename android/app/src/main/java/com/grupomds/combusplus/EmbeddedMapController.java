package com.grupomds.combusplus;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
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
    private int lastPayloadHash = 0;
    private int lastLeft = Integer.MIN_VALUE;
    private int lastTop = Integer.MIN_VALUE;
    private int lastWidth = -1;
    private int lastHeight = -1;
    private BitmapDescriptor normalMarker;
    private BitmapDescriptor favoriteMarker;

    EmbeddedMapController(MainActivity activity, FrameLayout root, WebView webView) {
        this.activity = activity;
        this.root = root;
        this.webView = webView;

        container = new FrameLayout(activity);
        container.setBackgroundColor(Color.WHITE);
        container.setVisibility(View.GONE);
        container.setElevation(0f);
        container.setClipChildren(true);
        container.setClipToPadding(true);
        container.setClipToOutline(true);
        container.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                float density = activity.getResources().getDisplayMetrics().density;
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), 12f * density);
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
        loading.setText("Buscando gasolineras cercanas…");
        loading.setTextColor(Color.WHITE);
        loading.setBackgroundColor(0xD9111318);
        loading.setPadding(22, 16, 22, 16);
        container.addView(
                loading,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT
                )
        );

        root.addView(container);

        normalMarker = createAppMarker(false);
        favoriteMarker = createAppMarker(true);

        mapView.getMapAsync(googleMap -> {
            map = googleMap;
            map.getUiSettings().setMapToolbarEnabled(false);
            map.getUiSettings().setZoomControlsEnabled(true);
            map.getUiSettings().setCompassEnabled(true);
            map.getUiSettings().setMyLocationButtonEnabled(false);

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
        int width = Math.max(1, Math.round((float) widthCss * density));
        int height = Math.max(Math.round(340f * density), Math.round((float) heightCss * density));

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
            String price = item.optString("price", "");
            String status = item.optString("status", "");
            String address = item.optString("address", "");
            boolean favorite = item.optBoolean("favorite", false);

            Marker marker = map.addMarker(
                    new MarkerOptions()
                            .position(new LatLng(latitude, longitude))
                            .title(name)
                            .snippet(join(price, status, address))
                            .anchor(0.5f, 1f)
                            .icon(favorite ? favoriteMarker : normalMarker)
                            .zIndex(favorite ? 10f : 1f)
            );

            if (marker != null && !id.isEmpty()) markerIds.put(marker, id);

            bounds.include(new LatLng(latitude, longitude));
            hasBounds = true;
            added++;
        }

        loading.setText(added == 0 ? "No se encontraron gasolineras cercanas." : added + " gasolineras cercanas");
        loading.setVisibility(added == 0 ? View.VISIBLE : View.GONE);

        if (hasBounds) {
            container.post(() -> {
                try {
                    map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), Math.round(54f * activity.getResources().getDisplayMetrics().density)));
                } catch (Exception ignored) {
                }
            });
        }
    }

    private BitmapDescriptor createAppMarker(boolean favorite) {
        float density = activity.getResources().getDisplayMetrics().density;
        int size = Math.round(62f * density);
        int tail = Math.round(14f * density);
        int logoSize = Math.round(28f * density);

        Bitmap bitmap = Bitmap.createBitmap(size, size + tail, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        float centerX = size / 2f;
        float centerY = size / 2f;
        float radius = size * 0.42f;

        Path pin = new Path();
        pin.moveTo(centerX, size + 9f * density);
        pin.cubicTo(centerX - radius * 0.45f, size * 0.78f, centerX - radius, size * 0.60f, centerX - radius, centerY);
        pin.arcTo(new RectF(centerX - radius, centerY - radius, centerX + radius, centerY + radius), 180f, 180f);
        pin.cubicTo(centerX + radius, size * 0.60f, centerX + radius * 0.45f, size * 0.78f, centerX, size + 9f * density);
        pin.close();

        paint.setColor(favorite ? 0xFFFFC107 : 0xFFB3131B);
        canvas.drawPath(pin, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3.5f * density);
        paint.setColor(Color.WHITE);
        canvas.drawPath(pin, paint);
        paint.setStyle(Paint.Style.FILL);

        float badgeSize = 34f * density;
        RectF badge = new RectF(centerX - badgeSize / 2f, centerY - badgeSize / 2f, centerX + badgeSize / 2f, centerY + badgeSize / 2f);
        paint.setColor(Color.WHITE);
        canvas.drawRoundRect(badge, 8f * density, 8f * density, paint);

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.5f * density);
        paint.setColor(0x22000000);
        canvas.drawRoundRect(badge, 8f * density, 8f * density, paint);
        paint.setStyle(Paint.Style.FILL);

        Bitmap logo = BitmapFactory.decodeResource(activity.getResources(), R.drawable.combusplus_marker_logo);
        if (logo == null) {
            logo = BitmapFactory.decodeResource(activity.getResources(), R.mipmap.ic_launcher);
        }

        if (logo != null) {
            Rect source = new Rect(0, 0, logo.getWidth(), logo.getHeight());
            int half = logoSize / 2;
            Rect destination = new Rect(Math.round(centerX) - half, Math.round(centerY) - half, Math.round(centerX) + half, Math.round(centerY) + half);
            canvas.drawBitmap(logo, source, destination, paint);
        }

        if (favorite) {
            Paint starPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            float cx = size - 12f * density;
            float cy = 12f * density;
            starPaint.setColor(Color.WHITE);
            canvas.drawCircle(cx, cy, 9f * density, starPaint);
            starPaint.setColor(0xFF111318);
            starPaint.setTextAlign(Paint.Align.CENTER);
            starPaint.setTextSize(12f * density);
            starPaint.setFakeBoldText(true);
            canvas.drawText("★", cx, cy + 4f * density, starPaint);
        }

        return BitmapDescriptorFactory.fromBitmap(bitmap);
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

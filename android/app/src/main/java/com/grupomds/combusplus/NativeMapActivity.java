package com.grupomds.combusplus;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.GoogleMapOptions;
import com.google.android.gms.maps.MapView;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.LatLngBounds;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NativeMapActivity extends Activity implements OnMapReadyCallback {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<Marker, Station> markerStations = new HashMap<>();

    private MapView mapView;
    private GoogleMap googleMap;
    private TextView statusView;
    private double latitude;
    private double longitude;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        latitude = getIntent().hasExtra("latitude")
                ? getIntent().getDoubleExtra("latitude", Double.NaN)
                : parseDouble(
                        SecureLocalStore.getString(
                                this,
                                WebBridge.LAST_LATITUDE,
                                ""
                        ),
                        Double.NaN
                );

        longitude = getIntent().hasExtra("longitude")
                ? getIntent().getDoubleExtra("longitude", Double.NaN)
                : parseDouble(
                        SecureLocalStore.getString(
                                this,
                                WebBridge.LAST_LONGITUDE,
                                ""
                        ),
                        Double.NaN
                );

        GoogleMapOptions options = new GoogleMapOptions()
                .zoomControlsEnabled(true)
                .compassEnabled(true)
                .mapToolbarEnabled(false);

        String mapId = safe(BuildConfig.GOOGLE_MAPS_ANDROID_MAP_ID);
        if (!mapId.isEmpty()) {
            options.mapId(mapId);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        mapView = new MapView(this, options);
        mapView.onCreate(savedInstanceState);
        mapView.getMapAsync(this);
        root.addView(
                mapView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );

        statusView = new TextView(this);
        statusView.setText("Cargando gasolineras cercanas…");
        statusView.setTextColor(Color.WHITE);
        statusView.setBackgroundColor(0xDD111214);
        statusView.setPadding(28, 22, 150, 22);

        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.gravity = Gravity.TOP;
        root.addView(statusView, statusParams);

        Button close = new Button(this);
        close.setText("Cerrar");
        close.setOnClickListener(view -> finish());

        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.setMargins(16, 14, 16, 0);
        root.addView(close, closeParams);

        setContentView(root);
    }

    @Override
    public void onMapReady(GoogleMap map) {
        googleMap = map;
        googleMap.getUiSettings().setZoomControlsEnabled(true);
        googleMap.getUiSettings().setCompassEnabled(true);

        googleMap.setOnInfoWindowClickListener(marker -> {
            Station station = markerStations.get(marker);
            if (station != null) {
                openRoute(station.latitude, station.longitude);
            }
        });

        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) {
            statusView.setText(
                    "No se pudo obtener la ubicación. Vuelve atrás y pulsa Actualizar."
            );
            googleMap.moveCamera(
                    CameraUpdateFactory.newLatLngZoom(
                            new LatLng(40.4168, -3.7038),
                            5.5f
                    )
            );
            return;
        }

        googleMap.moveCamera(
                CameraUpdateFactory.newLatLngZoom(
                        new LatLng(latitude, longitude),
                        12.5f
                )
        );

        loadStations();
    }

    private void loadStations() {
        executor.execute(() -> {
            try {
                NativeSessionManager.Session session =
                        NativeSessionManager.ensureSession(this, "android");

                JSONArray items = fetchNearby(session, latitude, longitude, 25d);

                runOnUiThread(() -> renderStations(items));
            } catch (Exception error) {
                runOnUiThread(() -> statusView.setText(
                        error.getMessage() == null
                                ? "No se pudieron cargar las gasolineras."
                                : error.getMessage()
                ));
            }
        });
    }

    private JSONArray fetchNearby(
            NativeSessionManager.Session session,
            double lat,
            double lon,
            double radius
    ) throws Exception {
        String base = safe(BuildConfig.SUPABASE_FUNCTIONS_URL)
                .replaceAll("/+$", "");

        if (base.isEmpty()) {
            throw new IOException("El servidor no está configurado.");
        }

        String query =
                "?latitud=" + encode(Double.toString(lat)) +
                "&longitud=" + encode(Double.toString(lon)) +
                "&radio=" + encode(Double.toString(radius)) +
                "&limite=250";

        HttpURLConnection connection = (HttpURLConnection)
                new URL(base + "/stations-nearby" + query).openConnection();

        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(25_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty(
                "User-Agent",
                "CombusplusAndroid/" + BuildConfig.VERSION_NAME
        );
        connection.setRequestProperty("x-installation-id", session.installationId);
        connection.setRequestProperty("x-combusplus-session", session.token);

        String publishable = safe(BuildConfig.SUPABASE_PUBLISHABLE_KEY);
        if (!publishable.isEmpty()) {
            connection.setRequestProperty("apikey", publishable);
            connection.setRequestProperty(
                    "Authorization",
                    "Bearer " + publishable
            );
        }

        int status = connection.getResponseCode();
        InputStream stream =
                status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String responseText = readStream(stream);
        connection.disconnect();

        JSONObject response = new JSONObject(responseText);

        if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
            throw new IOException(
                    response.optString(
                            "error",
                            "No se pudieron cargar las gasolineras."
                    )
            );
        }

        return response.optJSONArray("items") == null
                ? new JSONArray()
                : response.optJSONArray("items");
    }

    private void renderStations(JSONArray items) {
        if (googleMap == null) return;

        googleMap.clear();
        markerStations.clear();

        LatLngBounds.Builder bounds = new LatLngBounds.Builder();
        bounds.include(new LatLng(latitude, longitude));

        int added = 0;

        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item == null) continue;

            Station station = Station.from(item);
            if (station == null) continue;

            Marker marker = googleMap.addMarker(
                    new MarkerOptions()
                            .position(new LatLng(
                                    station.latitude,
                                    station.longitude
                            ))
                            .title(station.name)
                            .snippet(station.snippet())
            );

            if (marker != null) {
                markerStations.put(marker, station);
            }

            bounds.include(new LatLng(
                    station.latitude,
                    station.longitude
            ));
            added++;
        }

        if (added == 0) {
            statusView.setText(
                    "No hay gasolineras disponibles en esta zona."
            );
            return;
        }

        statusView.setText(
                added +
                " gasolineras cercanas · toca un marcador para ver sus datos"
        );

        try {
            googleMap.animateCamera(
                    CameraUpdateFactory.newLatLngBounds(
                            bounds.build(),
                            120
                    )
            );
        } catch (Exception ignored) {
            googleMap.moveCamera(
                    CameraUpdateFactory.newLatLngZoom(
                            new LatLng(latitude, longitude),
                            12.5f
                    )
            );
        }
    }

    private void openRoute(double lat, double lon) {
        Uri navigation = Uri.parse(
                "google.navigation:q=" + lat + "," + lon + "&mode=d"
        );

        Intent intent = new Intent(Intent.ACTION_VIEW, navigation);
        intent.setPackage("com.google.android.apps.maps");

        try {
            startActivity(intent);
        } catch (Exception ignored) {
            Uri fallback = Uri.parse("geo:0,0?q=" + lat + "," + lon);
            startActivity(new Intent(Intent.ACTION_VIEW, fallback));
        }
    }

    private static String readStream(InputStream stream) throws IOException {
        if (stream == null) return "";

        StringBuilder builder = new StringBuilder();

        try (
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(
                            stream,
                            StandardCharsets.UTF_8
                    )
            )
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }

        return builder.toString();
    }

    private static String encode(String value) {
        return Uri.encode(value);
    }

    private static double parseDouble(String value, double fallback) {
        try {
            return Double.parseDouble(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    @Override
    protected void onStart() {
        super.onStart();
        mapView.onStart();
    }

    @Override
    protected void onResume() {
        super.onResume();
        mapView.onResume();
    }

    @Override
    protected void onPause() {
        mapView.onPause();
        super.onPause();
    }

    @Override
    protected void onStop() {
        mapView.onStop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        mapView.onDestroy();
        super.onDestroy();
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        mapView.onLowMemory();
    }

    private static final class Station {
        final double latitude;
        final double longitude;
        final String name;
        final String address;
        final String price;

        Station(
                double latitude,
                double longitude,
                String name,
                String address,
                String price
        ) {
            this.latitude = latitude;
            this.longitude = longitude;
            this.name = name;
            this.address = address;
            this.price = price;
        }

        static Station from(JSONObject item) {
            double lat = number(item, "latitud", "latitude", "lat");
            double lon = number(item, "longitud", "longitude", "lng", "lon");

            if (!Double.isFinite(lat) || !Double.isFinite(lon)) {
                return null;
            }

            String name = first(
                    item,
                    "rotulo",
                    "rótulo",
                    "nombre",
                    "name",
                    "brand"
            );

            if (name.isEmpty()) name = "Gasolinera";

            String address = first(
                    item,
                    "direccion",
                    "dirección",
                    "address",
                    "localidad",
                    "municipio"
            );

            String price = extractPrice(item);

            return new Station(lat, lon, name, address, price);
        }

        String snippet() {
            if (!price.isEmpty() && !address.isEmpty()) {
                return price + " · " + address;
            }
            if (!price.isEmpty()) return price;
            if (!address.isEmpty()) return address;
            return "Toca para abrir la ruta";
        }

        private static String extractPrice(JSONObject item) {
            String direct = first(
                    item,
                    "precio",
                    "price",
                    "precioGasoleoA",
                    "precioGasolina95E5"
            );

            if (!direct.isEmpty()) {
                return direct.contains("€")
                        ? direct
                        : direct + " €/l";
            }

            JSONObject prices = item.optJSONObject("precios");
            if (prices == null) prices = item.optJSONObject("prices");

            if (prices != null) {
                JSONArray names = prices.names();
                if (names != null) {
                    for (int index = 0; index < names.length(); index++) {
                        String key = names.optString(index);
                        String value = prices.optString(key, "");
                        if (!value.isEmpty() && !"0".equals(value)) {
                            return value.contains("€")
                                    ? value
                                    : value + " €/l";
                        }
                    }
                }
            }

            return "";
        }

        private static double number(
                JSONObject item,
                String... keys
        ) {
            for (String key : keys) {
                Object value = item.opt(key);
                if (value == null) continue;

                try {
                    return Double.parseDouble(
                            String.valueOf(value)
                                    .replace(",", ".")
                                    .trim()
                    );
                } catch (Exception ignored) {
                }
            }

            return Double.NaN;
        }

        private static String first(
                JSONObject item,
                String... keys
        ) {
            for (String key : keys) {
                String value = item.optString(key, "").trim();
                if (!value.isEmpty() && !"null".equalsIgnoreCase(value)) {
                    return value;
                }
            }

            return "";
        }
    }
}

package com.grupomds.combusplus.car;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;

import com.grupomds.combusplus.BuildConfig;
import com.grupomds.combusplus.NativeSessionManager;
import com.grupomds.combusplus.SecureLocalStore;
import com.grupomds.combusplus.WebBridge;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class CarStationRepository {
    private static final String VEHICLES_KEY = "combusplus.v5.vehicles";
    private static final String SELECTED_VEHICLE_KEY = "combusplus.v5.selectedVehicle";
    private static final String NATIVE_CONFIG_KEY = "notification_config";

    private CarStationRepository() {}

    static Result load(Context context, double radiusKm, int limit) throws Exception {
        Vehicle vehicle = readSelectedVehicle(context);
        if (vehicle == null) {
            throw new IllegalStateException("Añade y selecciona un vehículo desde Combusplus en el móvil.");
        }
        if (vehicle.tankCapacity < 10d || vehicle.consumption <= 0d) {
            throw new IllegalStateException("Completa el consumo y la capacidad del depósito del vehículo.");
        }

        Coordinates origin = readCoordinates(context);
        if (origin == null) {
            throw new IllegalStateException("Abre Combusplus en el móvil y actualiza la ubicación una vez.");
        }

        String base = safe(BuildConfig.SUPABASE_FUNCTIONS_URL).replaceAll("/+$", "");
        if (base.isEmpty()) {
            throw new IllegalStateException("El servidor de Combusplus no está configurado en la APK.");
        }

        JSONObject nativeConfig = readNativeConfig(context);
        NativeSessionManager.Session session = NativeSessionManager.ensureSession(
                context,
                "android-auto"
        );

        JSONObject request = new JSONObject();
        request.put("latitude", origin.latitude);
        request.put("longitude", origin.longitude);
        request.put("radius", Math.max(1d, Math.min(radiusKm, 50d)));
        request.put("limit", Math.max(1, Math.min(limit, 50)));
        request.put("fuelKey", vehicle.fuelKey);
        request.put("consumption", vehicle.consumption);
        request.put("tankCapacity", vehicle.tankCapacity);
        request.put("amount", 0d);
        request.put("tripMode", "roundtrip");
        request.put("fullTank", true);
        request.put("discounts", nativeConfig.optJSONArray("discounts") == null
                ? new JSONArray()
                : nativeConfig.optJSONArray("discounts"));

        JSONObject response;
        try {
            response = requestJson(
                    base + "/recommend",
                    request,
                    safe(BuildConfig.SUPABASE_PUBLISHABLE_KEY),
                    session.token,
                    session.installationId
            );
        } catch (HttpStatusException error) {
            if (error.status != 401) throw error;
            NativeSessionManager.clearSession(context);
            session = NativeSessionManager.ensureSession(context, "android-auto", true);
            response = requestJson(
                    base + "/recommend",
                    request,
                    safe(BuildConfig.SUPABASE_PUBLISHABLE_KEY),
                    session.token,
                    session.installationId
            );
        }
        if (!response.optBoolean("ok", false)) {
            throw new IOException(response.optString("error", "No se pudieron cargar las gasolineras."));
        }

        JSONArray items = response.optJSONArray("items");
        List<Station> stations = new ArrayList<>();
        if (items != null) {
            for (int index = 0; index < items.length(); index++) {
                Station station = parseStation(items.optJSONObject(index));
                if (station != null) stations.add(station);
            }
        }
        return new Result(vehicle, origin, stations);
    }

    private static Station parseStation(JSONObject item) {
        if (item == null) return null;
        double latitude = item.optDouble("latitude", Double.NaN);
        double longitude = item.optDouble("longitude", Double.NaN);
        double distanceKm = item.optDouble("roadDistanceKm", item.optDouble("distanceKm", Double.NaN));
        double price = item.optDouble("price", Double.NaN);
        double tankCost = item.optDouble("tankCost", Double.NaN);
        double tripLiters = item.optDouble("tripLiters", Double.NaN);
        double usefulLiters = item.optDouble("netLiters", Double.NaN);
        double effectivePrice = item.optDouble("effectivePrice", Double.NaN);
        if (!validCoordinates(latitude, longitude)
                || !Double.isFinite(distanceKm) || distanceKm < 0d
                || !Double.isFinite(price) || price <= 0d
                || !Double.isFinite(tankCost) || tankCost <= 0d
                || !Double.isFinite(usefulLiters) || usefulLiters <= 0d
                || !Double.isFinite(effectivePrice) || effectivePrice <= 0d) {
            return null;
        }
        return new Station(
                item.optString("id", item.optString("name", "Gasolinera")),
                firstNonBlank(item.optString("name"), "Gasolinera"),
                firstNonBlank(item.optString("address"), "Dirección no disponible"),
                latitude,
                longitude,
                distanceKm,
                price,
                tankCost,
                Double.isFinite(tripLiters) ? tripLiters : 0d,
                usefulLiters,
                effectivePrice
        );
    }

    private static JSONObject readNativeConfig(Context context) {
        try {
            return new JSONObject(SecureLocalStore.getString(context, NATIVE_CONFIG_KEY, "{}"));
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static Vehicle readSelectedVehicle(Context context) {
        String raw = SecureLocalStore.getString(context, VEHICLES_KEY, "[]");
        String selectedId = SecureLocalStore.getString(context, SELECTED_VEHICLE_KEY, "");
        try {
            JSONArray vehicles = new JSONArray(raw == null ? "[]" : raw);
            JSONObject selected = null;
            for (int index = 0; index < vehicles.length(); index++) {
                JSONObject candidate = vehicles.optJSONObject(index);
                if (candidate == null) continue;
                if (selected == null) selected = candidate;
                if (!selectedId.isEmpty() && selectedId.equals(candidate.optString("id"))) {
                    selected = candidate;
                    break;
                }
            }
            if (selected == null) return null;
            return new Vehicle(
                    selected.optString("id"),
                    firstNonBlank(selected.optString("name"), "Mi vehículo"),
                    firstNonBlank(selected.optString("fuelKey"), "Diesel"),
                    selected.optDouble("consumption", Double.NaN),
                    selected.optDouble("tank", Double.NaN)
            );
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static Coordinates readCoordinates(Context context) {
        String latitudeText = SecureLocalStore.getString(context, WebBridge.LAST_LATITUDE, "");
        String longitudeText = SecureLocalStore.getString(context, WebBridge.LAST_LONGITUDE, "");
        if (!latitudeText.isEmpty() && !longitudeText.isEmpty()) {
            double latitude = parseDouble(latitudeText, Double.NaN);
            double longitude = parseDouble(longitudeText, Double.NaN);
            if (validCoordinates(latitude, longitude)) return new Coordinates(latitude, longitude);
        }

        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) return null;

        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return null;
        Location newest = null;
        try {
            for (String provider : manager.getProviders(true)) {
                Location location = manager.getLastKnownLocation(provider);
                if (location != null && (newest == null || location.getTime() > newest.getTime())) {
                    newest = location;
                }
            }
        } catch (SecurityException ignored) {
            return null;
        }
        if (newest == null || !validCoordinates(newest.getLatitude(), newest.getLongitude())) return null;
        return new Coordinates(newest.getLatitude(), newest.getLongitude());
    }

    private static JSONObject requestJson(
            String urlText,
            JSONObject body,
            String publishableKey,
            String sessionToken,
            String installationId
    ) throws IOException, JSONException {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(18_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "CombusplusAndroidAuto/9.0");
        if (!publishableKey.isEmpty()) {
            connection.setRequestProperty("apikey", publishableKey);
            connection.setRequestProperty("Authorization", "Bearer " + publishableKey);
        }
        connection.setRequestProperty("X-Combusplus-Session", sessionToken);
        connection.setRequestProperty("X-Installation-Id", installationId);
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String responseBody = readStream(stream);
        connection.disconnect();
        if (responseBody.isEmpty()) throw new IOException("El servidor no devolvió información.");
        JSONObject json = new JSONObject(responseBody);
        if (status < 200 || status >= 300) {
            throw new HttpStatusException(
                    status,
                    json.optString("error", "Error del servidor (" + status + ").")
            );
        }
        return json;
    }


    private static final class HttpStatusException extends IOException {
        final int status;

        HttpStatusException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static String readStream(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private static double parseDouble(String value, double fallback) {
        try { return Double.parseDouble(value); }
        catch (Exception ignored) { return fallback; }
    }

    private static boolean validCoordinates(double latitude, double longitude) {
        return Double.isFinite(latitude) && Double.isFinite(longitude)
                && latitude >= -90d && latitude <= 90d
                && longitude >= -180d && longitude <= 180d;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    static final class Result {
        final Vehicle vehicle;
        final Coordinates origin;
        final List<Station> stations;

        Result(Vehicle vehicle, Coordinates origin, List<Station> stations) {
            this.vehicle = vehicle;
            this.origin = origin;
            this.stations = stations;
        }
    }

    static final class Vehicle {
        final String id;
        final String name;
        final String fuelKey;
        final double consumption;
        final double tankCapacity;

        Vehicle(String id, String name, String fuelKey, double consumption, double tankCapacity) {
            this.id = id;
            this.name = name;
            this.fuelKey = fuelKey;
            this.consumption = consumption;
            this.tankCapacity = tankCapacity;
        }
    }

    static final class Coordinates {
        final double latitude;
        final double longitude;

        Coordinates(double latitude, double longitude) {
            this.latitude = latitude;
            this.longitude = longitude;
        }
    }

    static final class Station {
        final String id;
        final String name;
        final String address;
        final double latitude;
        final double longitude;
        final double distanceKm;
        final double price;
        final double tankCost;
        final double tripLiters;
        final double usefulLiters;
        final double effectivePrice;

        Station(
                String id,
                String name,
                String address,
                double latitude,
                double longitude,
                double distanceKm,
                double price,
                double tankCost,
                double tripLiters,
                double usefulLiters,
                double effectivePrice
        ) {
            this.id = id;
            this.name = name;
            this.address = address;
            this.latitude = latitude;
            this.longitude = longitude;
            this.distanceKm = distanceKm;
            this.price = price;
            this.tankCost = tankCost;
            this.tripLiters = tripLiters;
            this.usefulLiters = usefulLiters;
            this.effectivePrice = effectivePrice;
        }
    }
}

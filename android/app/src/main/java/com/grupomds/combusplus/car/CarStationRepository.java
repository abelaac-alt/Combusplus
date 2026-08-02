package com.grupomds.combusplus.car;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;

import com.grupomds.combusplus.BuildConfig;
import com.grupomds.combusplus.WebBridge;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

final class CarStationRepository {
    private static final String VEHICLES_KEY = "combusplus.v5.vehicles";
    private static final String SELECTED_VEHICLE_KEY = "combusplus.v5.selectedVehicle";
    private static final double ROAD_FACTOR = 1.18d;

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

        String url = base + "/stations-nearby"
                + "?latitud=" + encodeNumber(origin.latitude)
                + "&longitud=" + encodeNumber(origin.longitude)
                + "&radio=" + encodeNumber(radiusKm)
                + "&limite=" + Math.max(1, Math.min(limit, 50));

        JSONObject response = requestJson(url, safe(BuildConfig.SUPABASE_PUBLISHABLE_KEY));
        if (!response.optBoolean("ok", false)) {
            throw new IOException(response.optString("error", "No se pudieron cargar las gasolineras."));
        }

        JSONArray items = response.optJSONArray("items");
        List<Station> stations = new ArrayList<>();
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                Station station = parseStation(item, vehicle);
                if (station != null) stations.add(station);
            }
        }
        stations.sort(Comparator
                .comparingDouble((Station station) -> station.effectivePrice)
                .thenComparingDouble(station -> station.distanceKm));
        return new Result(vehicle, origin, stations);
    }

    private static Station parseStation(JSONObject item, Vehicle vehicle) {
        if (item == null) return null;
        double latitude = item.optDouble("latitud", Double.NaN);
        double longitude = item.optDouble("longitud", Double.NaN);
        double distanceKm = item.optDouble("distancia", Double.NaN);
        double price = item.optDouble(vehicle.fuelKey, Double.NaN);
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                || !Double.isFinite(distanceKm) || distanceKm < 0d
                || !Double.isFinite(price) || price <= 0d || price >= 10d) {
            return null;
        }

        double roadDistance = distanceKm * ROAD_FACTOR;
        double roundTripKm = roadDistance * 2d;
        double tripLiters = roundTripKm * vehicle.consumption / 100d;
        double usefulLiters = vehicle.tankCapacity - tripLiters;
        if (usefulLiters <= 0d) return null;
        double tankCost = vehicle.tankCapacity * price;
        double effectivePrice = tankCost / usefulLiters;

        String name = firstNonBlank(item.optString("rotulo"), item.optString("marca"), "Gasolinera");
        String address = joinAddress(
                item.optString("direccion"),
                item.optString("localidad"),
                item.optString("provincia")
        );
        return new Station(
                item.optString("idEstacion", name + "-" + latitude + "-" + longitude),
                name,
                address,
                latitude,
                longitude,
                distanceKm,
                price,
                tankCost,
                tripLiters,
                usefulLiters,
                effectivePrice
        );
    }

    private static Vehicle readSelectedVehicle(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(WebBridge.CACHE_PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(VEHICLES_KEY, "[]");
        String selectedId = prefs.getString(SELECTED_VEHICLE_KEY, "");
        try {
            JSONArray vehicles = new JSONArray(raw == null ? "[]" : raw);
            JSONObject selected = null;
            for (int i = 0; i < vehicles.length(); i++) {
                JSONObject candidate = vehicles.optJSONObject(i);
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
        SharedPreferences prefs = context.getSharedPreferences(WebBridge.CACHE_PREFS, Context.MODE_PRIVATE);
        if (prefs.contains(WebBridge.LAST_LATITUDE) && prefs.contains(WebBridge.LAST_LONGITUDE)) {
            double latitude = Double.longBitsToDouble(prefs.getLong(WebBridge.LAST_LATITUDE, 0L));
            double longitude = Double.longBitsToDouble(prefs.getLong(WebBridge.LAST_LONGITUDE, 0L));
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

    private static JSONObject requestJson(String urlText, String publishableKey) throws IOException, JSONException {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(18_000);
        connection.setRequestProperty("Accept", "application/json");
        if (!publishableKey.isEmpty()) {
            connection.setRequestProperty("apikey", publishableKey);
            connection.setRequestProperty("Authorization", "Bearer " + publishableKey);
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String body = readStream(stream);
        connection.disconnect();
        if (body.isEmpty()) throw new IOException("El servidor no devolvió información.");
        JSONObject json = new JSONObject(body);
        if (status < 200 || status >= 300) {
            throw new IOException(json.optString("error", "Error del servidor (" + status + ")."));
        }
        return json;
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

    private static String encodeNumber(double value) {
        return String.format(Locale.US, "%.6f", value);
    }

    private static boolean validCoordinates(double latitude, double longitude) {
        return Double.isFinite(latitude) && Double.isFinite(longitude)
                && latitude >= -90d && latitude <= 90d
                && longitude >= -180d && longitude <= 180d;
    }

    private static String joinAddress(String... parts) {
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.trim().isEmpty()) continue;
            if (builder.length() > 0) builder.append(", ");
            builder.append(part.trim());
        }
        return builder.length() == 0 ? "Dirección no disponible" : builder.toString();
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

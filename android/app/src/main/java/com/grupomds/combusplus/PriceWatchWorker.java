package com.grupomds.combusplus;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Iterator;
import java.util.Locale;

public class PriceWatchWorker extends Worker {
    private static final String[] ARRAY_KEYS = {"items", "data", "results", "estaciones", "stations"};

    public PriceWatchWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences(PriceWatchScheduler.PREFS, Context.MODE_PRIVATE);
        String rawConfig = prefs.getString(PriceWatchScheduler.CONFIG, "");
        if (rawConfig.trim().isEmpty()) return Result.success();

        try {
            JSONObject config = new JSONObject(rawConfig);
            boolean notificationsEnabled = config.optBoolean("enabled", false);
            JSONArray favorites = config.optJSONArray("favorites");
            if (favorites == null || favorites.length() == 0) return Result.success();

            double threshold = Math.max(0.001, config.optDouble("threshold", 0.001));
            String direction = config.optString("direction", "both");
            boolean hadTemporaryFailure = false;

            for (int i = 0; i < favorites.length(); i++) {
                JSONObject favorite = favorites.optJSONObject(i);
                if (favorite == null) continue;
                boolean notifyThisFavorite = notificationsEnabled && favorite.optBoolean("notifications", true);
                try {
                    checkFavorite(config, favorite, threshold, direction, prefs, notifyThisFavorite);
                } catch (Exception exception) {
                    hadTemporaryFailure = true;
                }
            }
            AppWidgetUpdater.updateAll(getApplicationContext());
            return hadTemporaryFailure ? Result.retry() : Result.success();
        } catch (Exception exception) {
            return Result.failure();
        }
    }

    private void checkFavorite(JSONObject config, JSONObject favorite, double threshold, String direction, SharedPreferences prefs, boolean notify) throws Exception {
        double latitude = favorite.optDouble("latitude", Double.NaN);
        double longitude = favorite.optDouble("longitude", Double.NaN);
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) return;

        String functionsUrl = config.optString("supabaseFunctionsUrl", "").replaceAll("/+$", "");
        String publishableKey = config.optString("supabasePublishableKey", "");
        String accessToken = config.optString("appAccessToken", "");
        if (functionsUrl.trim().isEmpty() || publishableKey.trim().isEmpty() || accessToken.trim().isEmpty()) return;

        String query = "latitud=" + encode(String.format(Locale.US, "%.6f", latitude)) +
                "&longitud=" + encode(String.format(Locale.US, "%.6f", longitude)) +
                "&radio=1&pagina=1&limite=50&fields=current";
        String endpoint = functionsUrl + "/stations-nearby?" + query;

        JSONObject response = getJson(endpoint, publishableKey, accessToken);
        JSONArray stations = findStationArray(response);
        if (stations == null) return;

        String favoriteId = favorite.optString("id", "");
        String favoriteName = favorite.optString("name", "");
        JSONObject station = findStation(stations, favoriteId, favoriteName);
        if (station == null) return;

        String fuelKey = favorite.optString("watchFuel", "Diesel");
        Double price = extractPrice(station, fuelKey);
        if (price == null) return;

        String prefKey = pricePreferenceKey(favoriteId, fuelKey);
        String changeKey = changePreferenceKey(favoriteId, fuelKey);
        double previous = prefs.contains(prefKey)
                ? Double.longBitsToDouble(prefs.getLong(prefKey, 0L))
                : favorite.optDouble("lastPrice", Double.NaN);
        double change = Double.isFinite(previous) ? price - previous : 0d;
        prefs.edit()
                .putLong(prefKey, Double.doubleToRawLongBits(price))
                .putLong(changeKey, Double.doubleToRawLongBits(change))
                .apply();
        if (!Double.isFinite(previous) || !notify) return;

        if (Math.abs(change) + 0.0000001 < threshold) return;
        if ("down".equals(direction) && change >= 0) return;
        if ("up".equals(direction) && change <= 0) return;

        String stationName = stationName(station, favoriteName);
        String fuelName = fuelLabel(fuelKey);
        String movement = change < 0 ? "ha bajado" : "ha subido";
        String title = "El " + fuelName + " " + movement;
        String body = stationName + ": de " + formatPrice(previous) + " a " + formatPrice(price) + " €/l (" + signed(change) + " €/l)";
        int notificationId = Math.abs((favoriteId + fuelKey).hashCode());
        NotificationHelper.show(getApplicationContext(), notificationId, title, body);
    }

    private JSONObject getJson(String endpoint, String publishableKey, String accessToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "CombusplusAndroid/6.0");
        connection.setRequestProperty("apikey", publishableKey);
        connection.setRequestProperty("Authorization", "Bearer " + publishableKey);
        connection.setRequestProperty("X-Combusplus-Token", accessToken);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            return new JSONObject(body.toString());
        } finally {
            connection.disconnect();
        }
    }

    static String pricePreferenceKey(String stationId, String fuelKey) {
        return "last_price_" + safeKey(stationId) + "_" + safeKey(fuelKey);
    }

    static String changePreferenceKey(String stationId, String fuelKey) {
        return "last_change_" + safeKey(stationId) + "_" + safeKey(fuelKey);
    }

    private JSONArray findStationArray(Object value) {
        if (value instanceof JSONArray) return (JSONArray) value;
        if (!(value instanceof JSONObject)) return null;
        JSONObject object = (JSONObject) value;
        for (String key : ARRAY_KEYS) {
            Object candidate = object.opt(key);
            if (candidate instanceof JSONArray) return (JSONArray) candidate;
            JSONArray nested = findStationArray(candidate);
            if (nested != null) return nested;
        }
        return null;
    }

    private JSONObject findStation(JSONArray stations, String id, String name) {
        JSONObject first = null;
        for (int i = 0; i < stations.length(); i++) {
            JSONObject station = stations.optJSONObject(i);
            if (station == null) continue;
            if (first == null) first = station;
            String stationId = firstAlias(station, "idEstacion", "id", "stationId", "IDEESS");
            if (!id.trim().isEmpty() && id.equals(stationId)) return station;
            String stationName = firstAlias(station, "nombreEstacion", "rotulo", "rótulo", "nombre", "marca", "label");
            if (!name.trim().isEmpty() && normalize(name).equals(normalize(stationName))) return station;
        }
        return first;
    }

    private Double extractPrice(JSONObject station, String fuelKey) {
        String[][] aliases = {
                {"Gasolina95", "Gasolina 95", "Gasolina 95 E5", "Precio Gasolina 95 E5", "PrecioGasolina95"},
                {"Diesel", "Diésel", "GasoleoA", "Gasóleo A", "Precio Gasóleo A", "PrecioGasoleoA"},
                {"Gasolina98", "Gasolina 98", "Gasolina 98 E5", "Precio Gasolina 98 E5", "PrecioGasolina98"},
                {"DieselPremium", "Diésel Premium", "GasoleoPremium", "Gasóleo Premium", "Precio Gasóleo Premium"},
                {"GLP", "Gases licuados del petróleo", "Precio GLP"},
                {"DieselB", "Diésel B", "GasoleoB", "Gasóleo B", "Precio Gasóleo B"}
        };
        String[] keys = {"Gasolina95", "Diesel", "Gasolina98", "DieselPremium", "GLP", "DieselB"};
        for (int i = 0; i < keys.length; i++) {
            if (!keys[i].equals(fuelKey)) continue;
            for (String alias : aliases[i]) {
                Object value = findByNormalizedKey(station, alias);
                Double number = parseNumber(value);
                if (number != null && number > 0 && number < 5) return number;
            }
        }
        return null;
    }

    private Object findByNormalizedKey(JSONObject object, String alias) {
        if (object.has(alias)) return object.opt(alias);
        String target = normalize(alias);
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (normalize(key).equals(target)) return object.opt(key);
        }
        return null;
    }

    private Double parseNumber(Object value) {
        if (value instanceof Number) return ((Number) value).doubleValue();
        if (!(value instanceof String)) return null;
        try {
            String clean = ((String) value).trim().replace(',', '.').replaceAll("[^0-9.-]", "");
            return clean.trim().isEmpty() ? null : Double.parseDouble(clean);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String firstAlias(JSONObject object, String... aliases) {
        for (String alias : aliases) {
            Object value = findByNormalizedKey(object, alias);
            if (value != null && !String.valueOf(value).trim().isEmpty()) return String.valueOf(value);
        }
        return "";
    }

    private String stationName(JSONObject station, String fallback) {
        String name = firstAlias(station, "nombreEstacion", "rotulo", "rótulo", "nombre", "marca", "label");
        return name.trim().isEmpty() ? fallback : name;
    }

    private String fuelLabel(String fuelKey) {
        switch (fuelKey) {
            case "Gasolina95": return "Gasolina 95";
            case "Gasolina98": return "Gasolina 98";
            case "DieselPremium": return "diésel premium";
            case "GLP": return "GLP";
            case "DieselB": return "Gasóleo B";
            default: return "Gasóleo A";
        }
    }

    private String normalize(String value) {
        String text = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD);
        return text.replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private String encode(String value) {
        try { return URLEncoder.encode(value, "UTF-8"); } catch (Exception ignored) { return value; }
    }

    private static String safeKey(String value) {
        return value == null ? "unknown" : value.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    private String formatPrice(double value) {
        return String.format(Locale.forLanguageTag("es-ES"), "%.3f", value);
    }

    private String signed(double value) {
        return String.format(Locale.forLanguageTag("es-ES"), "%+.3f", value);
    }
}

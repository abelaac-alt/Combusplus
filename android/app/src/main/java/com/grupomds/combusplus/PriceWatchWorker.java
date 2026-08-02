package com.grupomds.combusplus;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
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
        String rawConfig = SecureLocalStore.getString(getApplicationContext(), PriceWatchScheduler.CONFIG, "");
        if (rawConfig.trim().isEmpty()) return Result.success();

        try {
            JSONObject config = new JSONObject(rawConfig);
            boolean notificationsEnabled = config.optBoolean("enabled", false);
            JSONArray favorites = config.optJSONArray("favorites");
            if (favorites == null || favorites.length() == 0) return Result.success();

            NativeSessionManager.Session session = NativeSessionManager.ensureSession(
                    getApplicationContext(),
                    "android-worker"
            );

            double threshold = Math.max(0.001, config.optDouble("threshold", 0.001));
            String direction = config.optString("direction", "both");
            boolean hadTemporaryFailure = false;

            for (int i = 0; i < favorites.length(); i++) {
                JSONObject favorite = favorites.optJSONObject(i);
                if (favorite == null) continue;
                boolean notifyThisFavorite = notificationsEnabled && favorite.optBoolean("notifications", true);
                try {
                    checkFavorite(config, favorite, threshold, direction, notifyThisFavorite, session);
                } catch (Exception exception) {
                    hadTemporaryFailure = true;
                }
            }
            AppWidgetUpdater.updateAll(getApplicationContext());
            return hadTemporaryFailure ? Result.retry() : Result.success();
        } catch (JSONException exception) {
            return Result.failure();
        } catch (Exception exception) {
            return Result.retry();
        }
    }

    private void checkFavorite(
            JSONObject config,
            JSONObject favorite,
            double threshold,
            String direction,
            boolean notify,
            NativeSessionManager.Session session
    ) throws Exception {
        double latitude = favorite.optDouble("latitude", Double.NaN);
        double longitude = favorite.optDouble("longitude", Double.NaN);
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) return;

        String functionsUrl = BuildConfig.SUPABASE_FUNCTIONS_URL.replaceAll("/+$", "");
        String publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY;
        if (functionsUrl.trim().isEmpty() || session == null
                || session.token.trim().isEmpty() || session.installationId.trim().isEmpty()) return;

        String query = "latitud=" + encode(String.format(Locale.US, "%.6f", latitude)) +
                "&longitud=" + encode(String.format(Locale.US, "%.6f", longitude)) +
                "&radio=1&pagina=1&limite=50&fields=current";
        String endpoint = functionsUrl + "/stations-nearby?" + query;

        JSONObject response;
        try {
            response = getJson(endpoint, publishableKey, session.token, session.installationId);
        } catch (HttpStatusException error) {
            if (error.status != 401) throw error;
            NativeSessionManager.clearSession(getApplicationContext());
            NativeSessionManager.Session renewed = NativeSessionManager.ensureSession(
                    getApplicationContext(),
                    "android-worker",
                    true
            );
            response = getJson(endpoint, publishableKey, renewed.token, renewed.installationId);
        }
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
        String previousText = SecureLocalStore.getString(getApplicationContext(), prefKey, "");
        double previous = previousText.isEmpty()
                ? favorite.optDouble("lastPrice", Double.NaN)
                : parseDouble(previousText, Double.NaN);
        double change = Double.isFinite(previous) ? price - previous : 0d;
        SecureLocalStore.putString(getApplicationContext(), prefKey, Double.toString(price));
        SecureLocalStore.putString(getApplicationContext(), changeKey, Double.toString(change));
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

    private JSONObject getJson(String endpoint, String publishableKey, String sessionToken, String installationId) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "CombusplusAndroid/9.0");
        connection.setRequestProperty("apikey", publishableKey);
        connection.setRequestProperty("Authorization", "Bearer " + publishableKey);
        connection.setRequestProperty("X-Combusplus-Session", sessionToken);
        connection.setRequestProperty("X-Installation-Id", installationId);
        int status = connection.getResponseCode();
        java.io.InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        if (stream == null) {
            connection.disconnect();
            throw new HttpStatusException(status, "El servidor no devolvió información.");
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            JSONObject json = new JSONObject(body.length() == 0 ? "{}" : body.toString());
            if (status < 200 || status >= 300) {
                throw new HttpStatusException(
                        status,
                        json.optString("error", "Error del servidor (" + status + ").")
                );
            }
            return json;
        } finally {
            connection.disconnect();
        }
    }

    private static final class HttpStatusException extends Exception {
        final int status;

        HttpStatusException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private static double parseDouble(String value, double fallback) {
        try { return Double.parseDouble(value); }
        catch (Exception ignored) { return fallback; }
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

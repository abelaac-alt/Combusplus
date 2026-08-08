package com.grupomds.combusplus;

import android.content.Context;
import android.util.Base64;

import com.google.android.gms.tasks.Tasks;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

/**
 * Crea y renueva la sesión anónima del backend sin intervención del usuario.
 * Se utiliza desde Android Auto y desde WorkManager para que no dependan de que
 * la WebView permanezca abierta. Los valores se guardan cifrados mediante
 * {@link SecureLocalStore}.
 */
public final class NativeSessionManager {
    public static final String INSTALLATION_ID_KEY = "combusplus.v8.installationId";
    public static final String SESSION_TOKEN_KEY = "combusplus.v8.sessionToken";
    public static final String SESSION_EXPIRES_AT_KEY = "combusplus.v8.sessionExpiresAt";

    private static final Object LOCK = new Object();
    private static final long RENEW_MARGIN_MS = 5L * 60L * 1000L;

    private NativeSessionManager() {}

    public static Session ensureSession(Context context, String platform) throws Exception {
        return ensureSession(context, platform, false);
    }

    public static Session ensureSession(Context context, String platform, boolean force) throws Exception {
        synchronized (LOCK) {
            String installationId = installationId(context);
            String token = SecureLocalStore.getString(context, SESSION_TOKEN_KEY, "");
            long expiresAt = parseLong(
                    SecureLocalStore.getString(context, SESSION_EXPIRES_AT_KEY, "0"),
                    0L
            );
            if (!force && !token.isEmpty() && expiresAt > System.currentTimeMillis() + RENEW_MARGIN_MS) {
                return new Session(installationId, token, expiresAt);
            }

            String functionsUrl = safe(BuildConfig.SUPABASE_FUNCTIONS_URL).replaceAll("/+$", "");
            if (functionsUrl.isEmpty()) {
                throw new IllegalStateException("El servidor de Combusplus no está configurado en la aplicación.");
            }

            String safePlatform = normalizePlatform(platform);
            String requestHash = requestHash(installationId, safePlatform);
            String integrityToken = requestIntegrityToken(context, requestHash);

            JSONObject request = new JSONObject();
            request.put("installationId", installationId);
            request.put("platform", safePlatform);
            request.put("appVersion", BuildConfig.VERSION_NAME);
            request.put("requestHash", requestHash);
            if (!integrityToken.isEmpty()) request.put("integrityToken", integrityToken);

            JSONObject response = postJson(
                    functionsUrl + "/bootstrap",
                    request,
                    safe(BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            );
            if (!response.optBoolean("ok", false)) {
                throw new IOException(response.optString("error", "El backend no autorizó la instalación."));
            }

            token = response.optString("sessionToken", "");
            if (token.isEmpty()) throw new IOException("El backend no devolvió una sesión válida.");
            expiresAt = parseIso(response.optString("expiresAt", ""));
            if (expiresAt <= System.currentTimeMillis()) {
                expiresAt = System.currentTimeMillis() + 24L * 60L * 60L * 1000L;
            }

            SecureLocalStore.putString(context, SESSION_TOKEN_KEY, token);
            SecureLocalStore.putString(context, SESSION_EXPIRES_AT_KEY, Long.toString(expiresAt));
            mergeIntoNativeConfig(context, installationId, token, expiresAt);
            return new Session(installationId, token, expiresAt);
        }
    }

    public static void clearSession(Context context) {
        synchronized (LOCK) {
            SecureLocalStore.remove(context, SESSION_TOKEN_KEY);
            SecureLocalStore.remove(context, SESSION_EXPIRES_AT_KEY);
            try {
                JSONObject config = new JSONObject(
                        SecureLocalStore.getString(context, PriceWatchScheduler.CONFIG, "{}")
                );
                config.remove("sessionToken");
                config.remove("sessionExpiresAt");
                SecureLocalStore.putString(context, PriceWatchScheduler.CONFIG, config.toString());
            } catch (Exception ignored) {
            }
        }
    }

    private static String installationId(Context context) {
        String value = SecureLocalStore.getString(context, INSTALLATION_ID_KEY, "");
        if (value.matches("^[A-Za-z0-9_-]{32,160}$")) return value;
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        value = Base64.encodeToString(random, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        SecureLocalStore.putString(context, INSTALLATION_ID_KEY, value);
        return value;
    }

    private static String normalizePlatform(String platform) {
        if ("android-auto".equals(platform) || "android-worker".equals(platform)) return platform;
        return "android";
    }

    private static String requestHash(String installationId, String platform) throws Exception {
        long fiveMinuteBucket = System.currentTimeMillis() / 300_000L;
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                (installationId + "|" + platform + "|" + fiveMinuteBucket)
                        .getBytes(StandardCharsets.UTF_8)
        );
        return Base64.encodeToString(digest, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String requestIntegrityToken(Context context, String requestHash) {
        long projectNumber = BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
        if (projectNumber <= 0L) return "";
        try {
            StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(
                    context.getApplicationContext()
            );
            StandardIntegrityManager.StandardIntegrityTokenProvider provider = Tasks.await(
                    manager.prepareIntegrityToken(
                            StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                                    .setCloudProjectNumber(projectNumber)
                                    .build()
                    ),
                    25,
                    TimeUnit.SECONDS
            );
            StandardIntegrityManager.StandardIntegrityToken token = Tasks.await(
                    provider.request(
                            StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                                    .setRequestHash(requestHash)
                                    .build()
                    ),
                    25,
                    TimeUnit.SECONDS
            );
            return token == null || token.token() == null ? "" : token.token();
        } catch (Exception ignored) {
            // En modo optional el backend permite continuar. En modo enforce
            // devolverá un error controlado si la validación es obligatoria.
            return "";
        }
    }

    private static JSONObject postJson(String urlText, JSONObject body, String publishableKey)
            throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(25_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty(
                "User-Agent",
                "CombusplusAndroid/" + BuildConfig.VERSION_NAME
        );
        if (!publishableKey.isEmpty()) {
            connection.setRequestProperty("apikey", publishableKey);
            connection.setRequestProperty("Authorization", "Bearer " + publishableKey);
        }
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
        if (responseBody.isEmpty()) throw new IOException("El backend no devolvió información.");
        JSONObject json = new JSONObject(responseBody);
        if (status < 200 || status >= 300) {
            throw new IOException(json.optString("error", "Error del backend (" + status + ")."));
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

    private static void mergeIntoNativeConfig(
            Context context,
            String installationId,
            String token,
            long expiresAt
    ) {
        try {
            JSONObject config = new JSONObject(
                    SecureLocalStore.getString(context, PriceWatchScheduler.CONFIG, "{}")
            );
            config.put("installationId", installationId);
            config.put("sessionToken", token);
            config.put("sessionExpiresAt", expiresAt);
            config.put("supabaseFunctionsUrl", BuildConfig.SUPABASE_FUNCTIONS_URL);
            config.put("supabasePublishableKey", BuildConfig.SUPABASE_PUBLISHABLE_KEY);
            SecureLocalStore.putString(context, PriceWatchScheduler.CONFIG, config.toString());
        } catch (Exception ignored) {
        }
    }

    private static long parseIso(String value) {
        try { return Instant.parse(value).toEpochMilli(); }
        catch (Exception ignored) { return 0L; }
    }

    private static long parseLong(String value, long fallback) {
        try { return Long.parseLong(value); }
        catch (Exception ignored) { return fallback; }
    }

    private static String safe(String value) {
        return value == null ? "" : value.trim();
    }

    public static final class Session {
        public final String installationId;
        public final String token;
        public final long expiresAt;

        Session(String installationId, String token, long expiresAt) {
            this.installationId = installationId;
            this.token = token;
            this.expiresAt = expiresAt;
        }
    }
}

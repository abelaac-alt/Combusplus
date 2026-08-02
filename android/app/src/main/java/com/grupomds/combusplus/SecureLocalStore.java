package com.grupomds.combusplus;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Almacenamiento local cifrado con una clave AES/GCM protegida por Android Keystore.
 * Los datos de vehículos, favoritos, repostajes, sesiones y widgets nunca se guardan
 * en texto plano dentro de SharedPreferences.
 */
public final class SecureLocalStore {
    private static final String KEY_ALIAS = "combusplus_local_aes_v1";
    private static final String PREFS = "combusplus_secure_store_v1";
    private static final String MIGRATED = "__legacy_migrated";
    private static final Object LOCK = new Object();

    private SecureLocalStore() {}

    public static void migrateLegacy(Context context) {
        synchronized (LOCK) {
            SharedPreferences secure = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (secure.getBoolean(MIGRATED, false)) return;
            migrateFile(context, WebBridge.CACHE_PREFS);
            migrateFile(context, PriceWatchScheduler.PREFS);
            secure.edit().putBoolean(MIGRATED, true).commit();
        }
    }

    private static void migrateFile(Context context, String fileName) {
        SharedPreferences legacy = context.getSharedPreferences(fileName, Context.MODE_PRIVATE);
        for (Map.Entry<String, ?> entry : legacy.getAll().entrySet()) {
            String key = entry.getKey();
            Object raw = entry.getValue();
            if (key == null || raw == null || contains(context, key)) continue;
            String value;
            if (raw instanceof Long && isDoubleBitsKey(key)) {
                value = Double.toString(Double.longBitsToDouble((Long) raw));
            } else {
                value = String.valueOf(raw);
            }
            putString(context, key, value);
        }
        legacy.edit().clear().commit();
    }

    private static boolean isDoubleBitsKey(String key) {
        return WebBridge.LAST_LATITUDE.equals(key)
                || WebBridge.LAST_LONGITUDE.equals(key)
                || key.startsWith("last_price_")
                || key.startsWith("last_change_");
    }

    public static void putString(Context context, String key, String value) {
        synchronized (LOCK) {
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
                byte[] encrypted = cipher.doFinal((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
                byte[] iv = cipher.getIV();
                byte[] packed = new byte[1 + iv.length + encrypted.length];
                packed[0] = (byte) iv.length;
                System.arraycopy(iv, 0, packed, 1, iv.length);
                System.arraycopy(encrypted, 0, packed, 1 + iv.length, encrypted.length);
                String encoded = Base64.encodeToString(packed, Base64.NO_WRAP);
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(key, encoded).commit();
            } catch (Exception error) {
                throw new IllegalStateException("No se pudo cifrar el almacenamiento local.", error);
            }
        }
    }

    public static String getString(Context context, String key, String fallback) {
        synchronized (LOCK) {
            String encoded = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, null);
            if (encoded == null || encoded.isEmpty()) return fallback;
            try {
                byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
                if (packed.length < 14) return fallback;
                int ivLength = packed[0] & 0xFF;
                if (ivLength < 12 || 1 + ivLength >= packed.length) return fallback;
                byte[] iv = new byte[ivLength];
                byte[] encrypted = new byte[packed.length - 1 - ivLength];
                System.arraycopy(packed, 1, iv, 0, ivLength);
                System.arraycopy(packed, 1 + ivLength, encrypted, 0, encrypted.length);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
                return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            } catch (Exception error) {
                remove(context, key);
                return fallback;
            }
        }
    }

    public static boolean contains(Context context, String key) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(key);
    }

    public static void remove(Context context, String key) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(key).commit();
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}

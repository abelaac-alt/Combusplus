package com.grupomds.combusplus;

import android.content.Context;

import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.gms.tasks.Task;

public final class PlayIntegrityProvider {
    public interface Callback {
        void onResult(String token, String error);
    }

    private final long cloudProjectNumber;
    private final StandardIntegrityManager manager;
    private Task<StandardIntegrityManager.StandardIntegrityTokenProvider> providerTask;

    public PlayIntegrityProvider(Context context) {
        cloudProjectNumber = BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
        manager = IntegrityManagerFactory.createStandard(context.getApplicationContext());
        if (cloudProjectNumber > 0L) prepare();
    }

    private synchronized Task<StandardIntegrityManager.StandardIntegrityTokenProvider> prepare() {
        if (providerTask == null && cloudProjectNumber > 0L) {
            StandardIntegrityManager.PrepareIntegrityTokenRequest request =
                    StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                            .setCloudProjectNumber(cloudProjectNumber)
                            .build();
            providerTask = manager.prepareIntegrityToken(request);
        }
        return providerTask;
    }

    public void requestToken(String requestHash, Callback callback) {
        if (cloudProjectNumber <= 0L) {
            callback.onResult("", "");
            return;
        }
        Task<StandardIntegrityManager.StandardIntegrityTokenProvider> task = prepare();
        if (task == null) {
            callback.onResult("", "Play Integrity no está disponible.");
            return;
        }
        task.addOnSuccessListener(provider -> {
            StandardIntegrityManager.StandardIntegrityTokenRequest request =
                    StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                            .setRequestHash(requestHash)
                            .build();
            provider.request(request)
                    .addOnSuccessListener(token -> callback.onResult(token.token(), ""))
                    .addOnFailureListener(error -> callback.onResult("", safeMessage(error)));
        }).addOnFailureListener(error -> {
            synchronized (this) { providerTask = null; }
            callback.onResult("", safeMessage(error));
        });
    }

    private static String safeMessage(Exception error) {
        String value = error == null ? "" : error.getMessage();
        return value == null || value.trim().isEmpty()
                ? "No se pudo validar la integridad de Google Play."
                : value.substring(0, Math.min(180, value.length()));
    }
}

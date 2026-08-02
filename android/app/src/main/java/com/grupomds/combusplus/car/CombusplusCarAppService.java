package com.grupomds.combusplus.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

import com.grupomds.combusplus.BuildConfig;

public final class CombusplusCarAppService extends CarAppService {
    @NonNull
    @Override
    public HostValidator createHostValidator() {
        if (BuildConfig.DEBUG) return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        return new HostValidator.Builder(getApplicationContext())
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build();
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new CombusplusCarSession();
    }
}

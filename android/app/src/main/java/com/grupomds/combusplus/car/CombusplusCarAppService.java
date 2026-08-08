package com.grupomds.combusplus.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

import com.grupomds.combusplus.BuildConfig;
import com.grupomds.combusplus.R;

public final class CombusplusCarAppService extends CarAppService {
    @NonNull
    @Override
    public HostValidator createHostValidator() {
        if (BuildConfig.DEBUG) return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        return new HostValidator.Builder(getApplicationContext())
                .addAllowedHosts(R.array.car_hosts_allowlist)
                .build();
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new CombusplusCarSession();
    }
}

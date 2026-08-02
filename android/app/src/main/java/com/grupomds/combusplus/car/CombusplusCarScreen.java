package com.grupomds.combusplus.car;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableString;
import android.text.Spanned;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.CarLocation;
import androidx.car.app.model.Distance;
import androidx.car.app.model.DistanceSpan;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Metadata;
import androidx.car.app.model.Place;
import androidx.car.app.model.PlaceListMapTemplate;
import androidx.car.app.model.PlaceMarker;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class CombusplusCarScreen extends Screen {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean loading = true;
    private volatile String errorMessage = "";
    private volatile CarStationRepository.Result result;

    public CombusplusCarScreen(@NonNull CarContext carContext) {
        super(carContext);
        refresh();
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        if (loading) {
            return new PlaceListMapTemplate.Builder()
                    .setTitle("Combusplus")
                    .setHeaderAction(Action.APP_ICON)
                    .setCurrentLocationEnabled(true)
                    .setLoading(true)
                    .build();
        }

        if (!errorMessage.isEmpty()) {
            Action retry = new Action.Builder()
                    .setTitle("Reintentar")
                    .setOnClickListener(this::refresh)
                    .build();
            return new MessageTemplate.Builder(errorMessage)
                    .setTitle("Combusplus")
                    .setHeaderAction(Action.APP_ICON)
                    .addAction(retry)
                    .build();
        }

        List<CarStationRepository.Station> stations = result == null
                ? new ArrayList<>()
                : result.stations;
        ItemList.Builder list = new ItemList.Builder();
        if (stations.isEmpty()) {
            list.setNoItemsMessage("No hay gasolineras compatibles en el radio actual.");
        } else {
            int maxRows = Math.min(6, stations.size());
            for (int index = 0; index < maxRows; index++) {
                list.addItem(buildRow(stations.get(index), index));
            }
        }

        String vehicleName = result == null ? "" : result.vehicle.name;
        return new PlaceListMapTemplate.Builder()
                .setTitle(vehicleName.isEmpty() ? "Gasolineras cercanas" : "Mejor para " + vehicleName)
                .setHeaderAction(Action.APP_ICON)
                .setCurrentLocationEnabled(true)
                .setItemList(list.build())
                .build();
    }

    private Row buildRow(CarStationRepository.Station station, int index) {
        boolean best = index == 0;
        String title = best ? "MEJOR · " + station.name : station.name;

        SpannableString distanceAndPrice = new SpannableString(
                "x · " + formatPrice(station.price) + " €/l · depósito " + formatMoney(station.tankCost)
        );
        distanceAndPrice.setSpan(
                DistanceSpan.create(Distance.create(station.distanceKm, Distance.UNIT_KILOMETERS_P1)),
                0,
                1,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        );

        PlaceMarker marker = new PlaceMarker.Builder()
                .setLabel(String.valueOf(index + 1))
                .setColor(best ? CarColor.RED : CarColor.BLUE)
                .build();
        Place place = new Place.Builder(CarLocation.create(station.latitude, station.longitude))
                .setMarker(marker)
                .build();
        Metadata metadata = new Metadata.Builder().setPlace(place).build();

        return new Row.Builder()
                .setTitle(title)
                .addText(distanceAndPrice)
                .addText(station.address)
                .setMetadata(metadata)
                .setOnClickListener(() -> navigate(station))
                .build();
    }

    private void refresh() {
        if (loading && result != null) return;
        boolean initialLoad = loading && result == null && errorMessage.isEmpty();
        loading = true;
        errorMessage = "";
        if (!initialLoad) invalidate();
        executor.execute(() -> {
            try {
                CarStationRepository.Result loaded = CarStationRepository.load(getCarContext(), 30d, 30);
                mainHandler.post(() -> {
                    result = loaded;
                    loading = false;
                    errorMessage = "";
                    invalidate();
                });
            } catch (Exception error) {
                String message = error.getMessage();
                mainHandler.post(() -> {
                    result = null;
                    loading = false;
                    errorMessage = message == null || message.trim().isEmpty()
                            ? "No se pudieron cargar las gasolineras."
                            : message;
                    invalidate();
                });
            }
        });
    }

    private void navigate(CarStationRepository.Station station) {
        Uri uri = Uri.parse("geo:" + station.latitude + "," + station.longitude
                + "?q=" + station.latitude + "," + station.longitude
                + "(" + Uri.encode(station.name) + ")");
        Intent intent = new Intent(CarContext.ACTION_NAVIGATE, uri);
        getCarContext().startCarApp(intent);
    }

    private static String formatPrice(double value) {
        return String.format(Locale.forLanguageTag("es-ES"), "%.3f", value);
    }

    private static String formatMoney(double value) {
        return String.format(Locale.forLanguageTag("es-ES"), "%.2f €", value);
    }
}

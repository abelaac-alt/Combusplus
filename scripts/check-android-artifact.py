#!/usr/bin/env python3
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

FORBIDDEN_NAMES = (
    "admin-analytics.html",
    "src/admin-analytics.js",
)

FORBIDDEN_TEXT = (
    b"x-combusplus-admin",
    b"/admin-analytics",
)

def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)

def main() -> None:
    if len(sys.argv) != 2:
        fail("Uso: check-android-artifact.py <apk-o-aab>")

    artifact = Path(sys.argv[1])
    if not artifact.is_file():
        fail(f"No existe {artifact}")

    with zipfile.ZipFile(artifact) as archive:
        names = archive.namelist()
        lowered = [name.lower() for name in names]

        for forbidden in FORBIDDEN_NAMES:
            if any(name.endswith(forbidden.lower()) for name in lowered):
                fail(f"El artefacto contiene {forbidden}")

        config_names = [
            name for name in names
            if name.lower().endswith("assets/www/config.js")
        ]

        if not config_names:
            fail("No se encontró assets/www/config.js")

        config = archive.read(config_names[0])

        if b"googleMapsKey: ''" not in config:
            fail("La clave web de Google Maps no debe estar dentro del APK/AAB")

        if b"googleMapId: ''" not in config:
            fail("El Map ID web no debe estar dentro del APK/AAB")

        app_names = [
            name for name in names
            if name.lower().endswith("assets/www/src/app.js")
        ]
        if not app_names:
            fail("No se encontró assets/www/src/app.js")

        app_source = archive.read(app_names[0])
        if (
            b"renderNativeMapV2" not in app_source
            or b"if (renderNativeEmbeddedMap())" not in app_source
        ):
            fail("La integración segura del mapa nativo no está incluida")

        for name in names:
            lower = name.lower()
            if not lower.endswith((".js", ".html", ".json", ".txt", ".xml")):
                continue

            info = archive.getinfo(name)
            if info.file_size > 3_000_000:
                continue

            content = archive.read(name)

            for marker in FORBIDDEN_TEXT:
                if marker in content:
                    fail(f"Referencia administrativa encontrada en {name}")

    print(
        f"OK: {artifact.name} no contiene panel administrativo "
        "ni credenciales web de Google Maps."
    )

if __name__ == "__main__":
    main()

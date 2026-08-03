#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

GOOGLE_KEY = re.compile(rb"AIza[0-9A-Za-z_-]{30,}")
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
        if GOOGLE_KEY.search(config):
            fail("Se ha incluido una clave de Google Maps en el APK/AAB")
        if b"googleMapsKey: ''" not in config:
            fail("googleMapsKey debe quedar vacío en Android")
        if b"googleMapId: ''" not in config:
            fail("googleMapId debe quedar vacío en Android")

        for name in names:
            lower = name.lower()
            if not lower.endswith((".js", ".html", ".json", ".txt", ".xml")):
                continue
            info = archive.getinfo(name)
            if info.file_size > 3_000_000:
                continue
            content = archive.read(name)
            if GOOGLE_KEY.search(content):
                fail(f"Posible clave de Google Maps encontrada en {name}")
            for marker in FORBIDDEN_TEXT:
                if marker in content:
                    fail(f"Referencia administrativa encontrada en {name}")

    print(f"OK: {artifact.name} no contiene panel administrativo ni clave de Google Maps.")

if __name__ == "__main__":
    main()

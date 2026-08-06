#!/usr/bin/env python3
from pathlib import Path

FILES = [
    Path(".github/workflows/build-apk.yml"),
    Path(".github/workflows/google-play.yml"),
]

anchor = (
    "      - name: Aplicar búsqueda rentable por ruta 10.6\n"
    "        run: python scripts/apply-v106-route-profitability.py\n"
)

addition = (
    anchor
    + "\n"
    + "      - name: Corregir sintaxis de función desestructurada 10.6.1\n"
    + "        run: python scripts/fix-v106-destructured-function.py\n"
)

for path in FILES:
    text = path.read_text(encoding="utf-8")

    if (
        "fix-v106-destructured-function.py"
        not in text
    ):
        if anchor not in text:
            raise RuntimeError(
                f"No se encontró el paso 10.6 en {path}."
            )
        text = text.replace(anchor, addition, 1)

    path.write_text(text, encoding="utf-8")

print("Workflows APK y Google Play actualizados a 10.6.1.")

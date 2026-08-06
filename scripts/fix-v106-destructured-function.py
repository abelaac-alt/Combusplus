#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"

source = APP.read_text(encoding="utf-8")

# La versión 10.6 sustituía una función con parámetros desestructurados.
# El analizador anterior confundía la llave del parámetro con la llave del
# cuerpo y dejaba detrás un fragmento como:
#
# } = {}) {
#
# seguido del cuerpo antiguo. Este bloque elimina únicamente ese fragmento
# residual y conserva la función nueva completa.

marker = "\n} = {}) {"
start = source.find(marker)

if start >= 0:
    opening = source.find("{", start)
    if opening < 0:
        raise RuntimeError(
            "Se encontró el fragmento residual, pero no su cuerpo."
        )

    depth = 0
    quote = None
    escaped = False
    template = False
    end = -1

    for index in range(opening, len(source)):
        char = source[index]

        if quote:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == quote:
                quote = None
            continue

        if char in ("'", '"', "`"):
            quote = char
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end < 0:
        raise RuntimeError(
            "No se pudo cerrar el cuerpo residual de runFullTankSearch."
        )

    source = source[:start] + source[end:]

# Segunda defensa: el fragmento no debe quedar después de la reparación.
if "} = {}) {" in source:
    raise RuntimeError(
        "Sigue existiendo un fragmento de función desestructurada inválido."
    )

# Debe existir una única función completa y válida.
signature = "async function runFullTankSearch({"
if source.count(signature) != 1:
    raise RuntimeError(
        "La función runFullTankSearch no aparece exactamente una vez."
    )

APP.write_text(source, encoding="utf-8")
print("Corrección de sintaxis 10.6.1 aplicada correctamente.")

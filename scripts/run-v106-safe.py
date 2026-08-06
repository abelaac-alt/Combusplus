#!/usr/bin/env python3
"""
Ejecuta la actualización 10.6 corrigiendo primero el analizador de funciones.

La versión original de apply-v106-route-profitability.py localizaba la primera
llave después de "function nombre(". En funciones con parámetros
desestructurados, esa primera llave pertenece a los parámetros y no al cuerpo.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "scripts/apply-v106-route-profitability.py"

if not ORIGINAL.is_file():
    raise RuntimeError(
        "No existe scripts/apply-v106-route-profitability.py"
    )

source = ORIGINAL.read_text(encoding="utf-8")

start = source.find("def replace_function(")
end = source.find("\ndef insert_dom_reference(", start)

if start < 0 or end < 0:
    raise RuntimeError(
        "No se ha podido localizar el analizador de funciones del script 10.6."
    )

replacement = r"""def replace_function(
    source: str,
    name: str,
    replacement: str,
) -> str:
    signatures = [
        f"async function {name}(",
        f"function {name}(",
    ]

    start = next(
        (
            source.find(signature)
            for signature in signatures
            if source.find(signature) >= 0
        ),
        -1,
    )

    if start < 0:
        raise RuntimeError(
            f"No se encontró la función {name}"
        )

    parameter_open = source.find("(", start)
    if parameter_open < 0:
        raise RuntimeError(
            f"No se encontraron los parámetros de {name}"
        )

    parenthesis_depth = 0
    quote = None
    escaped = False
    parameter_close = -1

    for index in range(parameter_open, len(source)):
        char = source[index]

        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in ("'", '"', "`"):
            quote = char
            continue

        if char == "(":
            parenthesis_depth += 1
        elif char == ")":
            parenthesis_depth -= 1
            if parenthesis_depth == 0:
                parameter_close = index
                break

    if parameter_close < 0:
        raise RuntimeError(
            f"No se pudieron cerrar los parámetros de {name}"
        )

    opening = parameter_close + 1
    while (
        opening < len(source) and
        source[opening].isspace()
    ):
        opening += 1

    if (
        opening >= len(source) or
        source[opening] != "{"
    ):
        raise RuntimeError(
            f"La función {name} no tiene un cuerpo válido"
        )

    brace_depth = 0
    quote = None
    escaped = False

    for index in range(opening, len(source)):
        char = source[index]

        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in ("'", '"', "`"):
            quote = char
            continue

        if char == "{":
            brace_depth += 1
        elif char == "}":
            brace_depth -= 1
            if brace_depth == 0:
                return (
                    source[:start]
                    + replacement.strip()
                    + source[index + 1:]
                )

    raise RuntimeError(
        f"No se pudo cerrar la función {name}"
    )


"""

patched = source[:start] + replacement + source[end + 1:]

compiled = compile(
    patched,
    str(ORIGINAL),
    "exec",
)

namespace = {
    "__name__": "__main__",
    "__file__": str(ORIGINAL),
    "__package__": None,
}

exec(compiled, namespace)

print(
    "Combusplus 10.6.3: actualización por ruta aplicada "
    "con analizador seguro."
)

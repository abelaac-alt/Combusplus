#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web/src/app.js"

source = APP.read_text(encoding="utf-8")


def remove_balanced_block(text: str, start: int) -> tuple[str, bool]:
    """
    Elimina un bloque residual que empieza en una firma inválida del tipo:
        } = {}) {
    y termina en la llave de cierre correspondiente.
    """
    opening = text.find("{", start)
    if opening < 0:
        return text, False

    depth = 0
    quote = None
    escaped = False

    for index in range(opening, len(text)):
        char = text[index]

        if quote is not None:
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
                return text[:start] + text[index + 1:], True

    return text, False


# El error puede aparecer con espacios o saltos de línea distintos.
patterns = [
    re.compile(r"\n\s*}\s*=\s*\{\s*\}\s*\)\s*\{"),
    re.compile(r"\n\s*}\s*=\s*\{\s*\}\s*\)\s*=>\s*\{"),
]

removed = 0

while True:
    match = None

    for pattern in patterns:
        match = pattern.search(source)
        if match:
            break

    if not match:
        break

    source, ok = remove_balanced_block(source, match.start())
    if not ok:
        raise RuntimeError(
            "Se encontró un fragmento inválido, pero no se pudo "
            "identificar su cierre."
        )

    removed += 1

# Limpieza adicional por si quedó solo la cabecera inválida sin cuerpo.
source = re.sub(
    r"(?m)^\s*}\s*=\s*\{\s*\}\s*\)\s*\{\s*$",
    "",
    source,
)

# Comprobaciones finales.
remaining = re.search(
    r"}\s*=\s*\{\s*\}\s*\)\s*(?:=>\s*)?\{",
    source,
)

if remaining:
    line = source.count("\n", 0, remaining.start()) + 1
    excerpt = source[
        max(0, remaining.start() - 80):
        min(len(source), remaining.end() + 120)
    ]
    raise RuntimeError(
        "Sigue existiendo una firma inválida en la línea "
        f"{line}. Fragmento: {excerpt!r}"
    )

signature = "async function runFullTankSearch({"
count = source.count(signature)

if count != 1:
    raise RuntimeError(
        "runFullTankSearch debe existir exactamente una vez, "
        f"pero aparece {count} veces."
    )

# Comprobación simple del equilibrio global de llaves fuera de cadenas.
depth = 0
quote = None
escaped = False

for index, char in enumerate(source):
    if quote is not None:
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
        if depth < 0:
            line = source.count("\n", 0, index) + 1
            raise RuntimeError(
                f"Llave de cierre sobrante en la línea {line}."
            )

if depth != 0:
    raise RuntimeError(
        "El archivo JavaScript conserva llaves sin cerrar "
        f"(diferencia: {depth})."
    )

APP.write_text(source, encoding="utf-8")

print(
    "Corrección 10.6.2 aplicada correctamente. "
    f"Fragmentos residuales eliminados: {removed}."
)

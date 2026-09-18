#!/usr/bin/env python3
"""Genera una versión compacta de la tabla para el tablero web."""

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOURCES = [DATA_DIR / "BD_ManttoSSGG.csv", DATA_DIR / "BD_ManttoSSGG.csv.csv"]
OUTPUT = DATA_DIR / "dashboard.json.gz"


def clean(value):
    return str(value or "").strip()


def number(value):
    text = clean(value).replace(" ", "")
    if not text:
        return 0
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        value = float(text)
        return int(value) if value.is_integer() else value
    except ValueError:
        return 0


def main():
    source = next((path for path in SOURCES if path.exists()), None)
    if source is None:
        raise SystemExit("No se encontró BD_ManttoSSGG.csv ni BD_ManttoSSGG.csv.csv")

    dictionary_fields = ["months", "categories", "items", "shortItems", "classes", "costCenters", "costCenterIds", "suppliers", "periods"]
    dictionaries = {field: [] for field in dictionary_fields}
    indexes = {field: {} for field in dictionary_fields}

    def index(field, value):
        value = clean(value)
        if not value:
            return -1
        if value not in indexes[field]:
            indexes[field][value] = len(dictionaries[field])
            dictionaries[field].append(value)
        return indexes[field][value]

    rows = []
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            month = clean(row.get("MES'")).upper()
            item = clean(row.get("Partida'"))
            budget = number(row.get("$ SEM"))
            actual = number(row.get("IMPORTE"))
            if not (month or item or budget or actual):
                continue

            detail = clean(row.get("DETALLE*")) or clean(row.get("Glosa'")) or clean(row.get("DETALLE"))
            cost_center = clean(row.get("CCOSTO")) or clean(row.get("IDCCOSTO"))
            rows.append([
                index("months", month),
                index("categories", row.get("Rubro'")),
                index("items", item),
                index("shortItems", row.get("Partida*")),
                index("classes", row.get("Clase")),
                detail,
                index("costCenters", cost_center),
                index("costCenterIds", row.get("IDCCOSTO")),
                index("suppliers", row.get("RAZON_SOCIAL")),
                index("periods", row.get("PERIODO")),
                number(row.get("CANTIDAD")),
                budget,
                actual,
            ])

    payload = {"version": 2, **dictionaries, "rows": rows}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as compressed:
            compressed.write(encoded)

    print(f"{len(rows):,} filas: {source.name} -> {OUTPUT.name}")


if __name__ == "__main__":
    main()

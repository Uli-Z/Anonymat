#!/usr/bin/env python3
"""Generate an offline European settlement lexicon for the single-file build.

Input: GeoNames cities500.zip (population >500 or administrative seats).
Attribution: GeoNames, https://www.geonames.org/, CC BY 4.0.
The bundled output never contains personal text or sends user input anywhere.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

SOURCE = "https://download.geonames.org/export/dump/cities500.zip"
OUTPUT = Path(__file__).resolve().parents[1] / "src/data/europe-cities.json"
PROMINENT_OUTPUT = Path(__file__).resolve().parents[1] / "src/data/europe-prominent-cities.json"
MIN_PROMINENT_POPULATION = 50_000
# Inclusive geographic/political definition (with transcontinental caveats).
EUROPE = set("""
AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI
GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU
SE SI SJ SK SM TR UA VA XK
""".split())


def build(zip_file: Path) -> tuple[list[str], list[str]]:
    names: set[str] = set()
    prominent: set[str] = set()
    with zipfile.ZipFile(zip_file) as archive:
        with archive.open("cities500.txt") as data:
            rows = csv.reader(io.TextIOWrapper(data, encoding="utf-8"), delimiter="\t")
            for row in rows:
                if len(row) < 15 or row[8] not in EUROPE or row[6] != "P":
                    continue
                # Restrict transcontinental Russia to its European portion.
                # Turkey is included as a political/cultural transcontinental region.
                if row[8] == "RU" and float(row[5]) > 60.0:
                    continue
                for name in (row[1], row[2]):
                    name = name.strip()
                    if 3 <= len(name) <= 85 and not any(c.isdigit() for c in name):
                        names.add(name)
                        if row[14].isdigit() and int(row[14]) >= MIN_PROMINENT_POPULATION:
                            prominent.add(name)
    return sorted(names, key=str.casefold), sorted(prominent, key=str.casefold)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", type=Path, help="Use a previously downloaded GeoNames ZIP")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--prominent-output", type=Path, default=PROMINENT_OUTPUT)
    args = parser.parse_args()
    if args.zip is None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "cities500.zip"
            print(f"Fetching {SOURCE}")
            urllib.request.urlretrieve(SOURCE, source)
            names, prominent = build(source)
    else:
        names, prominent = build(args.zip)
    if len(names) < 1000:
        raise RuntimeError("Unexpectedly small city dictionary; output not overwritten")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(names, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    args.prominent_output.write_text(json.dumps(prominent, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Included {len(names)} distinct European city/settlement names ({args.output.stat().st_size} bytes)")
    print(f"Included {len(prominent)} variants of cities with at least {MIN_PROMINENT_POPULATION} inhabitants")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate a POS-grounded homonym list for European city/settlement names.

Input: German-GSD Universal Dependencies CoNLL-U train/dev/test (CC BY-SA 4.0).
Only actual running-text forms tagged as ordinary words (not PROPN) count as
evidence of a homonym. This is NOT a list of terms guaranteed not to be names.
The generated JSON contains only overlaps with the current GeoNames gazetteer.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import unicodedata
import urllib.request
from collections import Counter
from pathlib import Path

BASE = "https://raw.githubusercontent.com/UniversalDependencies/UD_German-GSD/master/"
CORPUS_FILES = ("de_gsd-ud-train.conllu", "de_gsd-ud-dev.conllu", "de_gsd-ud-test.conllu")
HERE = Path(__file__).resolve().parents[1]
CITIES = HERE / "src/data/europe-cities.json"
OUTPUT = HERE / "src/data/de-common-city-collisions.json"
# Closed classes are also common words; uppercase at sentence start can look like towns.
COMMON_TAGS = {"NOUN", "ADJ", "VERB", "AUX", "ADV", "DET", "PRON", "ADP", "CCONJ", "SCONJ", "PART", "INTJ"}
WORD = re.compile(r"^[^\W\d_][^\W\d_]*$", re.UNICODE)


def norm(value: str) -> str:
    return unicodedata.normalize("NFC", value).lower()


def observe(lines, counts: Counter[str]) -> None:
    for line in lines:
        if not line or line.startswith("#"):
            continue
        cells = line.rstrip("\n").split("\t")
        if len(cells) != 10 or not cells[0].isdigit():
            continue
        form, tag, other = cells[1], cells[3], cells[9]
        if tag not in COMMON_TAGS or "NamedEntity=Yes" in other:
            continue
        form = norm(form)
        if 3 <= len(form) <= 75 and WORD.fullmatch(form):
            counts[form] += 1


def generate(cities_path: Path, corpus_paths: list[Path]) -> tuple[list[str], int]:
    city_set = {norm(s) for s in json.loads(cities_path.read_text(encoding="utf-8"))}
    common: Counter[str] = Counter()
    if corpus_paths:
        for path in corpus_paths:
            with path.open(encoding="utf-8") as source:
                observe(source, common)
    else:
        for filename in CORPUS_FILES:
            print(f"Fetching {BASE + filename}")
            with urllib.request.urlopen(BASE + filename, timeout=80) as response:
                observe(io.TextIOWrapper(response, encoding="utf-8"), common)
    collisions = sorted(city_set & common.keys())
    return collisions, len(common)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cities", type=Path, default=CITIES)
    parser.add_argument("--corpus", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    hits, vocabulary_size = generate(args.cities, args.corpus)
    if not args.corpus and (len(hits) < 50 or vocabulary_size < 5000):
        raise RuntimeError(f"Too few corpus terms/collisions ({vocabulary_size}/{len(hits)}): refusing incomplete build")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(hits, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Observed {vocabulary_size} ordinary word forms; {len(hits)} also match European place names")


if __name__ == "__main__":
    main()

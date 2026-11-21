#!/usr/bin/env python3
"""Build compact, offline-first name/street lexica; no user data is transmitted.

Names: Onomaverse v2026.10 (CC BY 4.0), country-level frequency, all countries
Streets: OpenPLZ API data from OSM, ODbL 1.0, Germany
Use --given/--surnames/--streets for local test fixtures instead of downloading.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import re
import urllib.request
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
RELEASE="https://github.com/onomaverse/datasets/releases/download/v2026.10/"
STREETS_URL="https://raw.githubusercontent.com/openpotato/openplzapi.data/main/src/de/osm/streets.updated.csv"
ALLOWED=re.compile(r"^[^\W\d_][\w'’\- ]{1,79}$",re.UNICODE)

def source_lines(path:Path|None,url:str):
    if path:
        return path.read_text(encoding="utf-8-sig").splitlines()
    print("Downloading:",url,flush=True)
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"Anonymat offline lexicon builder"}),timeout=120) as response:
        return io.TextIOWrapper(response,encoding="utf-8-sig").read().splitlines()

def names(path:Path|None,filename:str)->list[str]:
    reader=csv.DictReader(source_lines(path,RELEASE+filename))
    found=set()
    for row in reader:
        name=(row.get("name") or "").strip()
        if ALLOWED.fullmatch(name) and 2<=len(name)<=80:
            found.add(name)
    return sorted(found,key=str.casefold)

def streets(path:Path|None)->list[str]:
    reader=csv.DictReader(source_lines(path,STREETS_URL))
    found=set()
    for row in reader:
        # OpenPLZ csv uses "Name"; a valid street may not end in Straße/Weg.
        name=(row.get("Name") or row.get("name") or "").strip()
        if ALLOWED.fullmatch(name) and 3<=len(name)<=80 and not name.isdigit():
            found.add(name)
    return sorted(found,key=str.casefold)

def write(path:Path,values:list[str])->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(values,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"{path.name}: {len(values)} distinct entries, {path.stat().st_size} bytes",flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--given",type=Path)
    parser.add_argument("--surnames",type=Path)
    parser.add_argument("--streets",type=Path)
    parser.add_argument("--output-dir",type=Path,default=ROOT/"src/data")
    parser.add_argument("--allow-small",action="store_true")
    args=parser.parse_args()
    parts=[
        ("given-names.json",names(args.given,"given-name-frequency.csv"),1000),
        ("family-names.json",names(args.surnames,"surname-frequency.csv"),1000),
        ("street-names.json",streets(args.streets),3000),
    ]
    for filename,values,minimum in parts:
        if len(values)<minimum and not args.allow_small:
            raise RuntimeError(f"{filename}: only {len(values)} entries; do not publish incomplete lexicon")
    for filename,values,_ in parts:
        write(args.output_dir/filename,values)

if __name__=="__main__":
    main()

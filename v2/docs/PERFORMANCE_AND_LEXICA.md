# Lexicon size, benchmark and UI responsiveness

## Sources and attribution

All public reference data are downloaded by CI/Pages **only at build time**.
No source text or identified person is ever sent to a reference-data server.

| Dataset | Included | License |
| --- | --- | --- |
| GeoNames cities500 | Europe, settlements / city variants | CC BY 4.0, https://www.geonames.org/ |
| Onomaverse v2026.10 given-name-frequency.csv | Global given names (all represented countries, deduplicated) | CC BY 4.0, https://onomaverse.com/datasets |
| Onomaverse v2026.10 surname-frequency.csv | Global family names (all represented countries, deduplicated) | CC BY 4.0, https://onomaverse.com/datasets |
| OpenPLZ API OSM-derived German streets | Deduplicated Germany street names | Open Database License (ODbL 1.0), © OpenStreetMap contributors, https://www.openstreetmap.org/copyright and https://github.com/openpotato/openplzapi.data |
| Universal Dependencies German-GSD | Part-of-speech collision evidence for ordinary words/place names | CC BY-SA 4.0, https://github.com/UniversalDependencies/UD_German-GSD |

The ODbL street-name derived database may impose attribution/share-alike
obligations on redistributed adapted databases. The generated lists are
provided as separate data modules so their independent source licenses and
attribution are visible. Review compatibility when republishing a differently
licensed combined derived database.

## Reproduction

    cd v2
    python3 scripts/generate-city-lexicon.py
    python3 scripts/generate-ambiguity-lexicon.py
    python3 scripts/generate-person-street-lexica.py
    npm install
    npm run verify

The checked-in development seeds are intentionally small; the Pages and CI
builders replace them. Names are evidence of possible identity, not proof;
a single given name or family name without context is not automatically
removed merely because it appears in a lexicon. Street matching similarly
requires a house number or address/location context. These safeguards
reduce false positives while missing some true identifiers.

## Runtime algorithm

- A single prebuilt hash set per lexicon, not one regular expression per entry.
- Scan a document in bounded word windows (up to 5 words for streets,
  6 for cities) with set membership checks.
- Learn a few document-local names via an Aho-Corasick index.
- Remove overlapping proposals with an occupied-range bitset rather than
  quadratic pairwise candidate comparisons.
- Pre-index excluded terms and existing tokens once per scan.
- Debounce editor changes (150 ms), run analysis and replacement in an
  **inline Web Worker** included in the standalone HTML; main UI remains
  responsive.
- Worker messages are numbered: outdated results are discarded. A pending
  stale worker is terminated rather than queueing unbounded scans.
- A visible stage-progress bar and abort/retry controls are provided.
  The bar does not claim to calculate a precise ETA.
- While scan is pending/failed/aborted, the copy action is disabled and
  stale pseudonymized text is hidden.

## Full-dictionary benchmark (GitHub CI Linux, Node 22)

Example run on 2026-11-21, warmed indexes:
- 10,000 characters: 21 ms
- 100,000 characters: 208 ms
- 1,000,000 characters: 2,155 ms

These numbers cover the entire detect/review/replace pipeline and use
120,407 cities, 292,142 streets, 18,150 given names, 19,767 surnames.
They are **not** browser benchmarks, and do **not** include cold worker startup,
HTML parsing or the time CodeMirror needs to render all highlights. Client
devices vary. Run \`npm run test\` to collect a fresh \`ANONYMAT_PERFORMANCE\`
line, and use browser performance instrumentation to measure real devices.

## Limitations

No list recognizes every rare or newly coined name, address or street.
Large multilingual lexica increase ambiguous ordinary-word collisions; a
local manual review of the full text is still essential. The source data
can change at build time; pin raw downloads/checksums for fully reproducible
releases. No text is shipped to external services at runtime.

# Anonymat 2.0 — source and development

This directory contains the current Anonymat application (Svelte 5, TypeScript, CodeMirror). **[Use the app](https://uli-z.github.io/Anonymat/)** · [Project overview](../README.md) · [v2.0.1 release](https://github.com/Uli-Z/Anonymat/releases/tag/v2.0.1).

Anonymat pseudonymizes text entirely in the browser. Automatic detections can be corrected manually. Unsupported or uncertain findings require human review; pseudonymization is not a guarantee of anonymity.

## Build and test

Requires Node.js 22.12+.

```sh
cd v2
npm install
npm run dev       # local development
npm run check     # Svelte/TypeScript checks
npm test          # Vitest unit and regression tests
npm run build     # standalone HTML in dist/index.html
npm run test:e2e  # Playwright browser tests (requires Chrome)
```

`npm run verify` combines checks, unit tests, and the standalone build. The distribution embeds application code, styles, Web Worker, and available offline dictionaries in a **single HTML file**, which can be opened without a server.

The GitHub Actions release and Pages builds generate extended lexica first:

```sh
python3 scripts/generate-city-lexicon.py
python3 scripts/generate-ambiguity-lexicon.py
python3 scripts/generate-person-street-lexica.py
npm run verify
```

The generator scripts fetch reference data **at build time only**. The shipped application does not fetch dictionary data or send entered text to a remote service.

## Behavior and privacy

- English and German interface; browser language selected by default, with manual override.
- Automatic detection with distinguishable pending review suggestions and editable replacement types.
- Per-category detection settings, optional synthetic pseudonyms for supported names and places, and reversible date shifting.
- Restoring values from edited text works with the mapping of the current session; it may be ambiguous if external tools alter or remove replacement tokens.
- Entire texts and mappings are not persistently saved. Only if the user consents, individual learned terms are stored in the browser's IndexedDB, unencrypted within that browser profile; they can be removed via Settings or the relevant term menu.

## Technical documentation

[Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [Realistic test corpus](docs/REALISTIC_TEST_CORPUS.md) · [Dictionary sources, licenses and performance](docs/PERFORMANCE_AND_LEXICA.md) · [Location-name ambiguity](docs/COMMON_WORDS.md).

License: [GPL-3.0](../LICENSE).

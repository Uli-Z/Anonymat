# Anonymat 2.0.0

Anonymat 2.0 is the first stable release of the rebuilt browser-based text pseudonymization application. It replaces the 0.9.x interface as the default on GitHub Pages.

## Highlights

- Expanded local detection of names, addresses, cities, contact data, IDs, dates, amounts, measurements and other numbers, with context-sensitive matching and review suggestions for uncertain results.
- Manual corrections, per-category switches, ignored occurrences, and optional browser-local memory for confirmed terms.
- Reversible replacement tokens or locally generated pseudonyms for supported categories.
- Configurable date shifting; replaced and shifted spans are marked in the result preview.
- Restoring original values from text edited by external tools, with warnings about missing or ambiguous mappings.
- More focused three-step interface, German/English localization with browser-language detection, and a first-use safety acknowledgement.
- Responsive analysis in an embedded Web Worker, large offline reference dictionaries, and a downloadable single HTML file.

## Install or use

- **Online:** https://uli-z.github.io/Anonymat/
- **Offline:** Download `anonymat-2.0.0.html` attached to this release and open it in a modern browser.
- **Previous version:** https://uli-z.github.io/Anonymat/legacy/

## Important

**Anonymat provides pseudonymization, not guaranteed anonymization.** Detection may miss identifying details or produce false matches. Always review the complete result before sharing it. Text processing stays on your device; optional remembered terms are stored only locally with your consent. The tool does not by itself ensure GDPR compliance.

# Repository Guidelines

## Project Structure & Module Organization
- Core UI: `index.html` and `style.css` assemble the single-page app. Feature scripts (`anonymizer.js`, `editor.js`, `ui.js`, `modal.js`, `contextMenu.js`, `images.js`, `translations.js`, `placeholder.js`, `utils.js`, `config.js`, `date.js`) sit in the repo root and are bundled inline for release.
- Distribution: production artifacts live in `dist/` as `anonymat-<version>.html`. Update `version.txt` before builds.
- Tooling: `build_single_html.py` handles inlining and version stamping. Tests live in `test.js` and are injected only into the test build.

## Build, Test, and Development Commands
- Build production bundle: `python3 build_single_html.py` → `dist/anonymat-<version>.html`.
- Build test bundle: `python3 build_single_html.py -t` → `dist/anonymat-test-<version>.html` (includes test UI and harness).
- Watch mode (rebuild on change): `python3 build_single_html.py -w [-t]`.
- Delete last test bundle: `python3 build_single_html.py -d`.
- Run locally: open the generated HTML in a browser; no server or external dependencies.

## Coding Style & Naming Conventions
- JavaScript style: ES5/ES6 mix, 2-space indent, double quotes, semicolons. Keep IIFEs and plain modules; avoid new dependencies.
- Naming: use descriptive names for placeholders and UI IDs (e.g., `anonymizeBtn`, `namePlaceholder`). Keep placeholder labels TitleCase inside brackets (e.g., `[Email]`, `[Name_2]`).
- Formatting: preserve existing comment tone and guardrails; keep regex patterns readable and escaped.

## Testing Guidelines
- Test harness: `test.js` runs in the test build and surfaces results via the modal. Open `dist/anonymat-test-<version>.html` in a browser to view pass/fail details and copy errors.
- Add regression cases by extending `testCases` in `test.js`; prefer concise inputs with explicit expected outputs and round-trip checks (`anonymize` → `deanonymize`).
- No automated coverage tooling; keep new tests deterministic and offline.

## Compatibility & Privacy
- Browser support: relies on modern RegExp features (lookbehind, Unicode classes); target current Chrome/Edge/Firefox and Safari 16+.
- Runtime: fully offline; only sets an `AppConfig` cookie for language preference. No telemetry or external requests.

## Commit & Pull Request Guidelines
- Commits: follow the existing short imperative style (e.g., “Refactor placeholder detection logic”). Keep changes scoped and legible.
- PRs: include a clear summary, rationale, and manual test notes (browser + test build). Attach before/after screenshots for UI tweaks and link related issues when available.
- Versioning: bump `version.txt` when shipping a new bundle; ensure `dist/` outputs match the new version.

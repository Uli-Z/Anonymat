# Anonymat repository guidelines

## Active application
- The maintained application is **Anonymat 2** in `v2/`: Svelte 5, TypeScript, Vite, CodeMirror, and a locally embedded Web Worker.
- `v2/src/` contains the UI, detection and replacement logic; `v2/src/data/` holds small checked-in dictionary seeds.
- `v2/tests/` contains Vitest unit/regression suites and Playwright browser tests. `v2/docs/` explains architecture, testing and the source licenses for dictionary data.
- The repository root contains project metadata, release notes, and GitHub Actions workflows, **not** the old 0.9.x application.
- Historical releases remain accessible through Git tags and GitHub Releases; do not reintroduce old application sources or committed release bundles.

## Local development
Requires Node.js 22.12+ and npm 11.6+ (npm 11.21.3 in CI). Node 22 bundles npm 10, which can crash while resolving Vite peer dependencies; upgrade npm before installing.

```sh
npm install --global npm@11.21.3
cd v2
npm install --no-audit --no-fund
npm run dev           # development server
npm run check         # Svelte and TypeScript diagnostics
npm test              # Vitest
npm run build         # standalone offline HTML -> v2/dist/index.html
npm run verify        # check + unit tests + build
npm run test:e2e      # Playwright browser tests (requires browser setup)
```

The production build is a **single self-contained HTML file**. Do not commit generated `dist/`, `site/`, or `node_modules/` directories.

## Dictionary generation and deployment
The small checked-in dictionaries make local development possible without fetching reference datasets. Full release/Pages builds run these **at build time**:

```sh
cd v2
python3 scripts/generate-city-lexicon.py
python3 scripts/generate-ambiguity-lexicon.py
python3 scripts/generate-person-street-lexica.py
npm run verify
```

- `.github/workflows/ci-v2.yml` checks the maintained app.
- `.github/workflows/pages.yml` deploys Anonymat 2 to the GitHub Pages root and `/v2/`.
- `.github/workflows/release.yml` publishes a versioned single-HTML artifact when explicitly triggered by a release-notes/workflow change or manual dispatch.
- The current version is defined in `v2/package.json`, not a root `version.txt`.

## Changes, tests and privacy
- Keep the browser app fully local at runtime: no uploads of entered text, mappings, or remembered terms.
- Use synthetic data in tests. Add regression coverage for detection boundaries, overlapping matches, date shifts, and restoration of edited AI responses.
- Distinguish uncertain review suggestions from accepted replacements. User review is essential: pseudonymization is not guaranteed anonymization.
- Run `npm run verify` for functional changes. For browser UI changes, run Playwright tests as appropriate. Do not automatically publish releases for ordinary changes.
- Keep source and docs aligned; remove references to discontinued build scripts and versions rather than keeping unused compatibility code.

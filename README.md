# Anonymat 2.0.1

**Pseudonymize sensitive text locally before sharing it with other tools.** Anonymat runs in the browser and helps you identify and replace personal information. You can review every replacement and restore original values locally.

**[Open Anonymat 2.0](https://uli-z.github.io/Anonymat/)** · [Download the offline HTML file](https://github.com/Uli-Z/Anonymat/releases/latest) · [Release notes](RELEASE_NOTES.md)

## What's new in 2.0.1

- **Independent date findings:** Expressions such as `06.01.-10.01.2025` expose two individually editable date findings, without masking the separator or misidentifying the expression as a phone number. Date shifting and restoration continue to work across year boundaries.
- **More complete detection:** Names (including contextual and inflected forms), addresses, locations, dates, amounts and measurements, contact details, and common identifiers. Uncertain matches are visibly marked as suggestions rather than silently replaced.
- **You stay in control:** Review and correct findings in the text, add your own replacements, ignore individual occurrences, and enable or disable detection categories.
- **Reversible pseudonymization:** Choose placeholders or, for supported names and places, locally generated pseudonyms. Shift dates while preserving intervals where possible. Restore original values from an AI-generated or edited response in the same browser session.
- **Optional local memory:** With your consent, manually confirmed terms can be remembered in this browser profile and deleted again.
- **Simpler workflow:** Edit the source, inspect the result, copy it, and optionally restore an external response. The interface is available in English and German, with automatic browser-language selection.
- **Faster, self-contained processing:** Large offline dictionaries and analysis in a Web Worker. The downloadable application is a single HTML file.

## Get started

Use the [web app](https://uli-z.github.io/Anonymat/) or download **anonymat-2.0.1.html** from [GitHub Releases](https://github.com/Uli-Z/Anonymat/releases/tag/v2.0.1) and open it locally in a modern browser. Paste your text, review the highlighted findings, and inspect the pseudonymized result before copying it.

The previous version remains available [here](https://uli-z.github.io/Anonymat/legacy/).

## Privacy and important limitations

Anonymat processes entered text in your browser; it does not send that text to a server. Complete documents and replacement mappings remain in the browser session. Optional remembered terms are stored in the local browser profile only after consent and may themselves contain personal information.

**Pseudonymization is not anonymization.** Personal information may be missed or remain identifiable from context; replacements may be incorrect. **Review the entire output yourself before sharing it.** Using Anonymat does not automatically make a workflow compliant with data-protection law.

## Development

The application source is in [v2/](v2/). Requirements: Node.js 22.12+.

```sh
cd v2
npm install
npm run verify
# Standalone HTML: v2/dist/index.html
```

Build details, tests and dictionary sources: [V2 developer guide](v2/README.md) · [Testing](v2/docs/TESTING.md) · [Lexicon sources and licenses](v2/docs/PERFORMANCE_AND_LEXICA.md).

## License

[GNU General Public License v3.0](LICENSE).

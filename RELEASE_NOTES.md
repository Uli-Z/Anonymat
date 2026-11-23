# Anonymat 2.0.1

This maintenance release improves how separate calendar dates are handled in compact German date expressions and includes the recent usability improvements from Anonymat 2.0.

## Changes in 2.0.1

- **Two independent dates, not a combined range finding.** `06.01.-10.01.2025` is detected as `06.01.` and `10.01.2025`, with two highlights that can be edited, confirmed, ignored or assigned different replacement modes individually. The dash stays unchanged.
- **Consistent date shifting.** Both dates use the session's offset. For an abbreviated start date, the explicitly written year of the following date is used when needed for correct leap-year and year-boundary calculations, without joining the findings.
- **Reversible AI replies.** Both dates can be restored independently; missing dates in an AI response do not cause spurious errors. Newly derived dates can also be restored using the original shift.
- **Number defaults.** Single digits are excluded from automatic number masking. Multi-digit and decimal values remain detectable, and manual selections still work.
- **Streamlined controls.** Multiple selected findings can be managed together, and all detection categories (including numbers) appear side-by-side in Settings.

## Install or use

- **Online:** https://uli-z.github.io/Anonymat/
- **Offline:** Download `anonymat-2.0.1.html` attached to this release and open it in a modern browser.
- **Previous version:** https://github.com/Uli-Z/Anonymat/releases/tag/v2.0.0

## Important

**Anonymat pseudonymizes rather than guarantees anonymization.** Detection and replacements may miss or misclassify sensitive information, and newly calculated dates in AI responses should be verified. Review every output before sharing it. Text processing stays local in the browser; remembered terms require consent.

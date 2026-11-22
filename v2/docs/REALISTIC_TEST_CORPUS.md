# Realistischer Testkorpus für Anonymat 2.0

Stand: 22. November 2026. Ausschließlich **synthetische**, selbst erfundene Texte; niemals Patientenbriefe, echte personenbezogene Datensätze oder sensible Produktivdaten in Repository oder CI ablegen.

## Zweck und Umfang

Die Datei `tests/fixtures/realistic-scenarios.json` umfasst **60 kurze realistische Texte**: 42 Entwicklungsszenarien und anschließend 18 unabhängig formulierte Gegenproben (`set: "holdout"`). Jeder Datensatz enthält eine Kategorie, einen zusammenhängenden Quelltext, erwartete sensible Textspannen (mit Entitätstyp und ggf. `occurrence`) sowie ausdrücklich unerwünschte Markierungen.

Bereiche: Klinikaufnahme/Entlassung, Gesundheits- und Sozialarbeit, Schule, Kommunikation, Rechnungen, Bank- und Vorgangsnummern, IT-Logs, Anschriften, internationale Kalenderdaten, Chat-Sprache und Alltagstexte ohne schützenswerte Angaben. Belastungsproben sind fehlende Leerzeichen vor/nach Datumsangaben, Namen mit zusammengeschriebenen Anreden, ein Buchstabendreher im Vornamen, Datumsangaben mit zweistelligem Jahr und Hausnummern unmittelbar hinter Straßennamen.

Die Grundregel bleibt konservativ: **eindeutige personenbezogene Angaben schützen; allgemeine Begriffe nicht automatisch ersetzen; isolierte mehrdeutige Namen nur zur Prüfung vorschlagen.**

## Prüfmethode

`tests/realistic-corpus.test.ts` führt für jeden Text die echte `reviewDocument`-Pipeline aus und misst:

- Vollständige Abdeckung aller als *active* annotierten Textspannen (Vermeidung von Untererkennung).
- Exakte Original-Offsets und Kategorien, keine Teiltreffer oder stillschweigende Umkategorisierung.
- Unnötige aktive Maskierungen einschließlich ausdrücklich negativer Begriffe (Übererkennung).
- Erwartete *review*-Vorschläge, die ohne Bestätigung **nicht** anonymisiert werden.
- Verlustfreies Wiederherstellen von Token-Ersetzungen.
- Verlustfreies Wiederherstellen nach einer festen Datumsverschiebung von 30 Tagen (einschließlich unvollständiger Daten).

Nach dem Audit werden Ausgaben als `ANONYMAT_REALISTIC_AUDIT_SUMMARY`, `ANONYMAT_REALISTIC_AUDIT_FINDINGS` und `ANONYMAT_REALISTIC_DATE_ROUNDTRIP` in den Test- und CI-Logs ausgegeben. **Die Erwartungen sind als CI-Assertions verbindlich**; neue ungeschützte oder versehentlich maskierte Spannen lassen den Test fehlschlagen.

Die zweite Datei `tests/realistic-regressions.test.ts` prüft besonders problematische Beispiele separat, sodass sie bei künftigen Refactorings nicht unbemerkt zurückkehren.

## Reproduzierbarer Lauf

Aus dem Verzeichnis `v2/`:

```sh
npm install
npm test -- tests/realistic-corpus.test.ts tests/realistic-regressions.test.ts
npm run verify
```

Der V2-CI-Workflow führt zusätzlich Typprüfung, Svelte-Prüfung, Standalone-Build und Browser-Smoke-Tests aus.

## Messergebnis der korrigierten Version

Testlauf vom **22.11.2026**, nach Einbeziehung der 18 Gegenproben:

| Messgröße | Ergebnis |
| --- | ---: |
| Szenarien | 60 (42 Entwicklung + 18 Gegenprobe) |
| Erwartete sofortige Maskierungen | 139 |
| Davon vollständig geschützt, Kategorie und Originalspanne korrekt | 139 |
| Erwartete, zunächst unmaskierte Prüfvorschläge | 2 von 2 |
| Übersehene schützenswerte Spannen | 0 |
| Unerwartete automatische Maskierungen | 0 |
| Unerwünschte Prüfvorschläge | 0 |
| Nicht zurückführbare Textmaskierungen | 0 von 60 |
| Nicht zurückführbare Datumsverschiebungen | 0 von 60 |

Die erste Messung (vor Fehlerbehebungen) fand in den anfänglichen 42 Texten zehn ungeschützte Spannen, mehrere falsch zugeordnete Entitäten und zwölf unerwartete aktive Treffer. Die nachgeschobenen 18 unabhängigen Beispiele haben unter anderem den Fehler bei `17.11.2026um`, `Fr.Schmidt`, kompakten Anschriften, Datumsüberschneidungen mit Telefonnummern und periodischen Ausdrücken wie `Im Abschnitt 5` offengelegt. Diese Ursachen sind in der korrigierten Version adressiert.

## Grenzen der Aussage

Die Werte gelten **nur für diese 60 annotierten synthetischen Testtexte**. Sie sind keine wissenschaftlich repräsentative Sensitivitäts- oder Präzisionsschätzung und keine Datenschutzgarantie. Ungewöhnliche ausländische Namen, viele andere Tippfehler, OCR-Artefakte, komplexe Grammatik oder Texte außerhalb der erfassten Domänen können weiterhin Fehler erzeugen.

Zweistellige Jahreszahlen wie `05.04.26` werden aus Datenschutzgründen als Datum geschützt, **aber nicht automatisch auf ein Jahrhundert festgelegt oder verschoben**. Ungültige oder mehrdeutige Datumsangaben erfordern weiterhin menschliche Prüfung. Die Rückübersetzungstests modellieren Ersatz- und Verschiebungslogik, keine reale KI-Übersetzungsqualität.

Neue Fehlfälle sollten als kleine synthetische Szenarien zuerst dem Korpus und anschließend – wo sinnvoll – den verbindlichen Regressionstests hinzugefügt werden.

## Zweiter, unabhängiger Challenge-Durchlauf (22.11.2026)

`tests/fixtures/realistic-challenge-scenarios.json` ergänzt den ersten Korpus um **26 neue, vollständig erfundene Texte**, **46 aktiv zu schützende Fundstellen**, **2 reine Prüfvorschläge** und **59 negative Vergleichsphrasen**. Die erste 60-Text-Messung bleibt als separat reproduzierbare Referenz erhalten.

Im ersten, noch **unkorrigierten** Lauf wurden 42/46 Schutzstellen abgedeckt (41/46 exakt klassifiziert); 2/2 Prüfvorschläge waren korrekt. Die Fehler waren vier übersehene Namen: ein Bindestrichvorname mit Nachname, ein unbekannter Nachname in starkem Patientenkontext, ein Name mit internationalen diakritischen Großbuchstaben sowie ein kleingeschriebener Vorname im eindeutigen Chat-Kontext. Zusätzlich umfasste die Markierung von `10. Mai.` einen Satzpunkt. Es gab **0** Übermaskierungen der ausdrücklich negativen Phrasen und **0** fehlgeschlagene Rückführungen.

Nach gezielten Änderungen an `person-names.ts` und `partial-dates.ts` ergab der tatsächliche V2-CI-Testlauf:

| Messgröße, Zusatzkorpus | Nach Korrektur |
| --- | ---: |
| Vollständig abgedeckte aktive Schutzstellen | 46/46 |
| Exakte Typen und Originalspannen | 46/46 |
| Korrekte, unmaskierte Prüfvorschläge | 2/2 |
| Übersehene aktive Schutzstellen | 0 |
| Unerwartete automatische Treffer | 0 |
| Unerwünschte Prüfvorschläge | 0 |
| Maskierungen negativer Phrasen | 0 |
| Fehlerhafte Token-Rückführungen | 0/26 |
| Fehlerhafte Datums-Rückführungen | 0/26 |

Der Zusatztest läuft mit `npm test -- tests/realistic-challenge.test.ts` und ist nach dem Audit nun **verbindlich**: Schon eine fehlende, falsch klassifizierte oder zu breite Schutzstelle, eine zusätzliche automatische Markierung oder eine fehlgeschlagene Rückführung lässt CI scheitern.

Die neuen Regeln bleiben bewusst **kontextabhängig**: Unbekannte Namen werden nicht allein wegen Großschreibung automatisch geschützt; eine ausdrücklich angegebene Patientenbenennung kann jedoch unbekannte Namen rechtfertigen. Kleingeschriebene Vornamen erfordern eine enge, personenspezifische Gesprächsformulierung. Die Ergebnisse belegen nur diese synthetischen Beispiele, keine allgemeine garantierte Erkennungsquote.

# Testkonzept – Anonymat 2.0

## Bestehender automatisierter Testaufbau

**Vitest:** Alle Tests unter \`tests/**/*.test.ts\` laufen mit \`npm test\` in GitHub Actions. Sie testen Datenverarbeitung ohne DOM und ohne echte Personendaten.

**Playwright:** \`tests/e2e/*.spec.ts\` starten den tatsächlich erzeugten **file://-Single-HTML-Build** unter Chrome. Der Workflow baut zuerst die HTML-Datei, prüft Einzeldatei/keine CDN-Skripte, und testet erst danach Auswahl, Menü, Ignorieren, Mehrfachnamen und Rückübersetzung.

**Übersetzungsverträge:** \`tests/fixtures/translation/roundtrip.json\` enthält eigens erstellte deutsche Quellen und **simulierte** englische/französische/spanische KI-Antworten. Die Rückübersetzung muss die genauen Originalwerte in der veränderten Satzreihenfolge, Grammatik und Zeichensetzung wiederherstellen. Das überprüft Tokenstabilität und Mapping; es führt **keine reale KI-Übersetzung** aus und bewertet keine sprachliche Qualität.

**Datumstests:** \`tests/fixtures/translation/future-date-cases.json\` ist ein fachlicher Abnahmekatalog für DE/EN/FR/ES mit Schaltjahr, Jahreswechsel und sprachabhängigen Datumsformaten. \`tests/dates.test.ts\` führt diese Fälle jetzt aus und prüft zusätzlich mehrsprachige Wochentage, Mehrdeutigkeit, manuelle Regeln und den Umgang mit abgeleiteten oder mehrdeutigen Datumsangaben. \`tests/partial-dates.test.ts\` testet Tag/Monat ohne Jahr, Monat/Jahr, Monatsnamen, explizite Bezugsjahre, sichere Token-Fallbacks, mehrsprachige Rückführung und Zählung fehlender/doppelter Angaben.

**Last- und Unicode-Tests:** \`tests/term-index.test.ts\` misst künstliche längere Texte und viele Begriffe. Die Zeitschranke ist großzügig, um CI-Schwankungen zu tolerieren; engeres Performanceprofiling soll gesondert erfolgen.

## Prüfschwerpunkte

- Erkennung und bewusst nicht automatisch ersetzte, unsichere Vorschläge; korrekte Kategorien und Zeichenpositionen.
- Manuelle Auswahl, Terminologie-Regeln, Ausschlüsse und Konflikte zwischen Fundstellen.
- Platzhalter, synthetische Pseudonyme und wiederherstellbare Datumsverschiebungen einschließlich unvollständiger Angaben.
- KI-Antworten, in denen ursprüngliche Werte fehlen oder neue, aus verschobenen Daten abgeleitete Daten vorkommen.
- Realistische synthetische Korpora, Lasttests, Mehrsprachigkeit und Browserinteraktionen.

## Sicherheit

Nur synthetische Daten für Tests verwenden. Keine medizinischen Originaldaten in Repository, Logausgaben oder CI. Änderungen an Ersetzungslogik brauchen mindestens einen Rückübersetzungs- und einen Konflikttest. Auf Fehler *sichtbar hinweisen*, nicht raten. Tests von verschiedenen Sprachen sind Pflicht vor Einführung weiterer Formate.

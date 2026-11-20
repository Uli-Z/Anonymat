# Testkonzept – Anonymat 2.0

## Bestehender automatisierter Testaufbau

**Vitest:** Alle Tests unter \`tests/**/*.test.ts\` laufen mit \`npm test\` in GitHub Actions. Sie testen Datenverarbeitung ohne DOM und ohne echte Personendaten.

**Playwright:** \`tests/e2e/*.spec.ts\` starten den tatsächlich erzeugten **file://-Single-HTML-Build** unter Chrome. Der Workflow baut zuerst die HTML-Datei, prüft Einzeldatei/keine CDN-Skripte, und testet erst danach Auswahl, Menü, Ignorieren, Mehrfachnamen und Rückübersetzung.

**Übersetzungsverträge:** \`tests/fixtures/translation/roundtrip.json\` enthält eigens erstellte deutsche Quellen und **simulierte** englische/französische/spanische KI-Antworten. Die Rückübersetzung muss die genauen Originalwerte in der veränderten Satzreihenfolge, Grammatik und Zeichensetzung wiederherstellen. Das überprüft Tokenstabilität und Mapping; es führt **keine reale KI-Übersetzung** aus und bewertet keine sprachliche Qualität.

**Datumstests:** \`tests/fixtures/translation/future-date-cases.json\` ist ein fachlicher Abnahmekatalog für DE/EN/FR/ES mit Schaltjahr, Jahreswechsel und sprachabhängigen Datumsformaten. \`tests/dates.test.ts\` führt diese Fälle jetzt aus und prüft zusätzlich mehrsprachige Wochentage, Mehrdeutigkeit, manuelle Regeln und die Sicherung gegen neu eingefügte Datumsangaben.

**Last- und Unicode-Tests:** \`tests/term-index.test.ts\` misst künstliche längere Texte und viele Begriffe. Die Zeitschranke ist großzügig, um CI-Schwankungen zu tolerieren; engeres Performanceprofiling soll gesondert erfolgen.

## Abnahmematrix

| Bereich | Beispiele | Status |
| --- | --- | --- |
| Automatische Erkennung | Frau Müller … Müller, Teilwörter nicht ersetzen | Implementiert |
| Manuelle Korrektur | PERSON überschreiben in FIRST_NAME/LAST_NAME; Vorkommen lernen | Implementiert |
| Ausnahmen | Eine Fundstelle ignorieren vs. Begriff überall ignorieren | Implementiert |
| Ersetzungen | Konsistente Tokens, benutzerdefinierte eindeutige Tokens | Implementiert |
| Übersetzungs-Roundtrip | Simulierte Rückgaben EN/FR/ES, Umstellung und Warnungen | Implementiert |
| Performance | 800 Suchbegriffe und längerer synthetischer Text | Implementiert |
| Datum | DE/EN/FR/ES Parsing, Verschiebung, Umkehr, Intervalle | Implementiert (Tests) |
| Uhrzeit | Zeitzonen-/Mitternachtsfälle, kohärenter Offset | Offen |
| Synthetische Werte | Pseudonymnamen, E-Mail-Adressen, reversibel | Offen |
| Reale KI-Übersetzung | Integrationstest mit tatsächlicher Modellantwort | Offen, nur mit separatem Testadapter und synthetischen Daten |

## Sicherheit

Nur synthetische Daten für Tests verwenden. Keine medizinischen Originaldaten in Repository, Logausgaben oder CI. Änderungen an Ersetzungslogik brauchen mindestens einen Rückübersetzungs- und einen Konflikttest. Auf Fehler *sichtbar hinweisen*, nicht raten. Tests von verschiedenen Sprachen sind Pflicht vor Einführung weiterer Formate.

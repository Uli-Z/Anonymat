# Anonymat 2.0 – UI- und Technik-Prototyp

Die bisherige Version 0.9.3 bleibt im Root des Repositories erhalten. Die Svelte-5-Anwendung wird unabhängig in v2/ entwickelt.

## Funktionen im Alpha-Prototyp

- Lokaler Texteditor mit Live-Vorschlägen für E-Mail, IBAN, bestimmte Telefonnummern und Namen nach Anreden. Aus „Frau Müller“ wird „Müller“ für alle Vorkommen im aktuellen Dokument gelernt – auch vor der Anrede oder wenn der Name erst später eingetippt wird.
- Beliebige Textauswahl mit **einem Klick** auf die eingeblendete Aktion „Auswahl anonymisieren“ markieren; die gewählte Stelle lehrt Anonymat den gleichen Begriff für weitere Vorkommen.
- Automatische und manuelle Treffer sind direkt im Originaltext farblich hervorgehoben und anklickbar.
- Kontextmenü zum Ändern des Platzhaltertyps, Entfernen/Ignorieren einer Stelle oder Ignorieren eines Begriffs im gesamten Text.
- Pro Begriff gruppierte Trefferliste (z. B. „Müller × 3“) statt doppelter Zeilen; die Checkbox schaltet alle Vorkommen um. Im Text lässt sich separat genau eine Stelle ignorieren.
- Vorschau des pseudonymisierten Textes und Kopieren in die Zwischenablage.
- KI-Antwort mit Platzhaltern einfügen und lokal zurückübersetzen; Warnungen bei fehlenden/unbekannten Tokens.
- Keine Speicherung des Texts oder der Token-Zuordnung. Kein Backend.

**Alpha-Hinweis:** Die Erkennung ist unvollständig. Vor der Weitergabe vertraulicher Daten ist eine gründliche menschliche Prüfung erforderlich.

Datumsverschiebung ist optional: Ein gemeinsamer zufälliger Tagesoffset verschiebt vollständige Kalenderdaten, erhält Intervalle und kann in Deutsch, Englisch, Französisch oder Spanisch rückgängig gemacht werden. Eine bewusst wählbare Regel pro Datum entscheidet zwischen Verschiebung und Token. Uneindeutige Zahlenformate werden ohne explizite Einstellung ausgelassen. Wortlisten und weitere Muster bleiben geplant.

## Entwicklung

Voraussetzung: Node.js 22.12+.

    cd v2
    npm install
    npm run dev
    npm run verify

npm run build erzeugt dist/index.html, eine **einzelne vollständig eingebettete HTML-Datei**, die per Doppelklick geöffnet werden kann. Die Build-Prüfung lehnt fehlende oder nach außen verlinkte Skript-/Stylesheet-Dateien ab.

Bei Push auf main veröffentlicht GitHub Actions die bisherige Version im Root und das V2-Bundle unter **/v2/**.

## Datenschutz

Alles bleibt im Arbeitsspeicher dieses Browser-Tabs. Keine Browser-Speicherung der Inhalte, keine Modellaufrufe, keine Analytik. Manuelle Markierungen und lokale Ausnahmen werden bei Texteingaben positionsgenau mitverschoben. Nur vollständig gelöschte Markierungen oder geänderte, bewusst ignorierte Texte werden neu bewertet.

**Pseudonymisierung ist nicht gleich Anonymisierung.** Auch nach Ersetzungen können indirekte Identifikatoren im Text verbleiben.


## Regelpipeline und Tests (Alpha 3)

Die neue **Prioritätsfolge** lautet: automatische Detektoren → dokumentweit gelernte Begriffe → explizite manuelle Klassifizierung (überschreibt Auto-Erkennung) → lokale/globale Ausnahmen → Ersetzungsregel → Wiederherstellung.

Die Kategorie kann im Kontextmenü manuell auf **Vorname**, **Nachname**, **Datum** oder **Uhrzeit** geändert werden. Bei genau zweigliedrigen vollständigen Namen steht die Aktion **„In Vorname und Nachname aufteilen“** zur Verfügung; mehrdeutige Namen werden nicht automatisch zerlegt.

Die Ersetzungsliste zeigt den konkret eingesetzten Token und ermöglicht seine Bearbeitung. Benutzerdefinierte Tokens müssen eindeutig und in eckige Klammern gesetzt sein, z. B. \`[PATIENT_A]\`. Freitext wird bewusst nicht akzeptiert, da er sich nach einer KI-Übersetzung derzeit nicht zuverlässig rekonstruieren ließe. Die Datumsverschiebung (nur vollständige eindeutige Daten) ist umgesetzt. Uhrzeitverschiebung und synthetische Namen/E-Mail-Adressen sind **noch nicht implementiert**.

Für viele gelernte Wörter verwendet die Erkennung einen **Aho-Corasick-Mehrfachsuchindex** statt eines regulären Ausdrucks pro Begriff. Manuelle Treffer bleiben im Editor über ihre Textposition verankert.

Ausführung:

    npm run test:rules
    npm run test:translation
    npm run test:e2e

Unter \`tests/fixtures/translation/\` liegen **synthetische** deutsch-englische, -französische und -spanische Texte mit stabilen Platzhaltern. Diese prüfen die **Rückübersetzung** nach simulierten KI-Antworten, **nicht** die Übersetzungsqualität eines realen Modells. Die Datumsbeispiele in \`future-date-cases.json\` werden jetzt durch \`dates.test.ts\` ausgeführt. Details: [Testkonzept](docs/TESTING.md) und [Architektur](docs/ARCHITECTURE.md).

# Anonymat 2.0 – UI- und Technik-Prototyp

Die bisherige Version 0.9.3 bleibt im Root des Repositories erhalten. Die Svelte-5-Anwendung wird unabhängig in v2/ entwickelt.

## Funktionen im Alpha-Prototyp

- Lokaler Texteditor mit Live-Vorschlägen für E-Mail, IBAN, bestimmte Telefonnummern und Namen nach Anreden.
- Beliebige Textauswahl markieren und einer Platzhalterkategorie zuweisen.
- Vorgeschlagene Treffer per Checkbox akzeptieren/ablehnen.
- Vorschau des pseudonymisierten Textes und Kopieren in die Zwischenablage.
- KI-Antwort mit Platzhaltern einfügen und lokal zurückübersetzen; Warnungen bei fehlenden/unbekannten Tokens.
- Keine Speicherung des Texts oder der Token-Zuordnung. Kein Backend.

**Alpha-Hinweis:** Die Erkennung ist unvollständig. Vor der Weitergabe vertraulicher Daten ist eine gründliche menschliche Prüfung erforderlich.

Die geplanten Wortlisten, weitere Muster und sprachübergreifende Datumsverschiebung stehen in [PLAN_V2.md](../PLAN_V2.md) und folgen in späteren Schritten.

## Entwicklung

Voraussetzung: Node.js 22.12+.

    cd v2
    npm install
    npm run dev
    npm run verify

npm run build erzeugt dist/index.html, eine **einzelne vollständig eingebettete HTML-Datei**, die per Doppelklick geöffnet werden kann. Die Build-Prüfung lehnt fehlende oder nach außen verlinkte Skript-/Stylesheet-Dateien ab.

Bei Push auf main veröffentlicht GitHub Actions die bisherige Version im Root und das V2-Bundle unter **/v2/**.

## Datenschutz

Alles bleibt im Arbeitsspeicher dieses Browser-Tabs. Keine Browser-Speicherung der Inhalte, keine Modellaufrufe, keine Analytik. Ein Bearbeiten des Originaltexts verwirft positionsbezogene manuelle Markierungen, damit keine falschen Stellen ersetzt werden.

**Pseudonymisierung ist nicht gleich Anonymisierung.** Auch nach Ersetzungen können indirekte Identifikatoren im Text verbleiben.

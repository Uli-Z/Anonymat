# Anonymat 2.0 – UI- und Technik-Prototyp

Die bisherige Version 0.9.3 bleibt im Root des Repositories erhalten. Die Svelte-5-Anwendung wird unabhängig in v2/ entwickelt.

## Funktionen im Alpha-Prototyp

- Lokaler Texteditor mit Live-Vorschlägen für E-Mail, IBAN, bestimmte Telefonnummern und Namen nach Anreden. Aus „Frau Müller“ wird „Müller“ für alle weiteren Vorkommen im aktuellen Dokument gelernt.
- Beliebige Textauswahl mit **einem Klick** auf die eingeblendete Aktion „Auswahl anonymisieren“ markieren; die gewählte Stelle lehrt Anonymat den gleichen Begriff für weitere Vorkommen.
- Automatische und manuelle Treffer sind direkt im Originaltext farblich hervorgehoben und anklickbar.
- Kontextmenü zum Ändern des Platzhaltertyps, Entfernen/Ignorieren einer Stelle oder Ignorieren eines Begriffs im gesamten Text.
- Pro Begriff gruppierte Trefferliste (z. B. „Müller × 3“) statt doppelter Zeilen; die Checkbox schaltet alle Vorkommen um. Im Text lässt sich separat genau eine Stelle ignorieren.
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

Alles bleibt im Arbeitsspeicher dieses Browser-Tabs. Keine Browser-Speicherung der Inhalte, keine Modellaufrufe, keine Analytik. Manuelle Markierungen und lokale Ausnahmen werden bei Texteingaben positionsgenau mitverschoben. Nur vollständig gelöschte Markierungen oder geänderte, bewusst ignorierte Texte werden neu bewertet.

**Pseudonymisierung ist nicht gleich Anonymisierung.** Auch nach Ersetzungen können indirekte Identifikatoren im Text verbleiben.

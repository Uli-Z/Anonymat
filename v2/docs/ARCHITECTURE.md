# Architektur – Anonymat 2.0 (Alpha)

## Kette der Regeln

1. **Basisdetektoren (\`detect.ts\`)** erkennen kontextuelle Namen (auch deutsche Genitivformen), Telefonnummern, gültige IBAN, E-Mail sowie in `structured-pii.ts` Adressen, PLZ, URL, IP, BIC, Nummern mit Kontext und Kfz-Kennzeichen. `geography.ts` ergänzt ein ortsbezogenes, offline eingebettetes Lexikon mit Kontextprüfungen. Das Ergebnis sind Vorschläge mit UTF-16-Start/End-Offsets. Keine Ausgabe im Text wird hier verändert.
2. **Erlernte Dokumentbegriffe (\`term-index.ts\`)** erkennen vollständige Wörter mit Aho-Corasick als einmaligen Mehrfachscan. Aus „Frau Müller“ wird „Müller“ unabhängig von der Fundstelle erkannt, ebenso explizit markierte Texte. Alle Daten bleiben lokal.
3. **Benutzerregeln (\`overrides.ts\` und \`scanDocument\`)** gewinnen vor automatisch erkannten, überlappenden Kandidaten. Beispiel: „Anna Müller“ wird als Vorname „Anna“ und Nachname „Müller“ klassifiziert. Eine manuelle Auswahl erstellt Anker plus eine dokumentlokale Suchregel.
4. **Review (\`session.ts\`)** wendet lokale und globale Ignorierregeln an und gruppiert Fundstellen für die UI. Ignorierregeln erzeugen *keine* zusätzlichen Treffer.
5. **Ersetzung (`replacement-strategies.ts`, `replace.ts` und `synthetic.ts`)** verarbeitet nur freigegebene Fundstellen. Unterstützt sind Tokens, eigene eindeutige Tokens und lokale lexikonbasierte Pseudonyme für Namen, Städte, Straßen und einfache Adressen. Der Zuordnungseintrag bewahrt die genaue Originalschreibweise; ein Dokument-Seed erlaubt bei jeder Neuanalyse identische Pseudonyme.
6. **Rückübersetzung (`restoreText`)** ersetzt Tokens und Pseudonyme in einem Durchlauf. Fehlende oder unbekannte Tokens werden gemeldet. Bei abgeänderten Pseudonymen oder zufällig identischen Wörtern in KI-Antworten ist die Rückübersetzung möglicherweise unvollständig oder mehrdeutig.

Die UI (\`App.svelte\`) ist nur Adapter dieser reinen Funktionen. CodeMirror verwaltet Textänderungen; \`marks.ts\` verschiebt manuelle Anker bei Bearbeitung.

## Prioritätsregeln

\`\`\`text
Automatische Treffer (niedrig)
       ↓
Dokumentweit erlernte automatische Namen
       ↓
Explizit manuell klassifizierte Treffer (hoch)
       ↓
Einzelne/global ignorierte Treffer (Ausschluss)
       ↓
Ersatzwerte (Token oder eigener Token)
\`\`\`

Bei überlappenden Fundstellen gewinnt zuerst die manuelle Festlegung, dann der längere Treffer. Für mehrdeutige Fälle muss weiterhin manuell geprüft werden.

## Ortslexikon und Ambiguitäten

Das Ortslexikon wird in einem lokalen `Set` einmalig aufgebaut und anhand maximal sechs aufeinanderfolgender Wörter abgeglichen. Geographischer Kontext reduziert Fehlalarme durch ambige Namen wie „Essen“, „Waren“, „Lage“. Kein personenbezogener Text verlässt den Browser. GeoNames ist nicht vollständig; der Release-Build lädt die aktuelle Städte-/Siedlungsliste **nur beim Build** herunter. Siehe [CITY_LEXICON.md](CITY_LEXICON.md). 

## Erweiterungspunkte (noch NICHT verfügbar)

\`shift-date\` ist als optionale Regel umgesetzt. \`dates.ts\` parst vollständige Kalenderdaten in de/en/fr/es, normalisiert auf ISO-Kalendertage und verschiebt sie gemeinsam mittels UTC-Kalendertagsarithmetik. \`partial-dates.ts\` erkennt Tag+Monat, Monat+Jahr und kontextgebundene Monatsangaben. Unvollständige Angaben werden standardmäßig als Tokens geschützt. Ein Tag+Monat ohne Jahr darf nur mit explizitem Bezugsjahr denselben Offset verwenden und wird anhand der im Export gespeicherten verschobenen ISO-Tage (Occurrence-Ledger) wiederhergestellt. Monat+Jahr hat keinen eindeutigen Kalendertag und wird nie für einen Tagesoffset auf einen erfundenen Tag ergänzt. Bei Duplikaten, fehlenden und neu eingefügten Daten wird gewarnt. Die Wiederherstellung vollständiger Daten berücksichtigt ebenfalls nur die im exportierten Text tatsächlich verschobenen ISO-Tage und meldet andere Daten. \`shift-time\`, \`synthetic-name\` und \`synthetic-email\` bleiben geplante, nicht ausführbare Modi.

Besonders für datums- und uhrzeitbasierte Ersetzung müssen Parser/Formatter unabhängig von der Sprache des KI-Texts sein, dürfen ausschließlich eindeutige Daten verändern und müssen die Umkehrrechnung auf echte wiedererkannte Daten begrenzen. Zufallsoffsets werden mit Web Crypto erstellt und sind nur Pseudonymisierung, nicht garantierte Anonymisierung.

## Leistungsziele und Grenzen

- Der Mehrfachindex läuft asymptotisch in O(Textlänge + Gesamtlänge der Suchbegriffe + Treffer) statt bei vielen Begriffen jeweils den Text erneut zu scannen.
- Bekannte RegEx werden separat einmal je Muster angewendet.
- \`removeOverlaps\` verarbeitet Kandidaten derzeit bei vielen Überlappungen noch quadratisch; erst optimieren, wenn Messungen dies erfordern.
- Bei großen Dokumenten kann das vollständige Neuscannen nach jedem Tastendruck die UI blockieren. Für längere Texte künftig Debounce/Worker *ohne Datenversand* erwägen und mit Lasttests prüfen.
- Vollständige medizinische oder allgemeine PII-Erkennung wird nicht garantiert.
- Keine serverseitigen Dienste, kein CDN, keine persistente Ablage von Originalen oder Zuordnungen.

## POS-basierter gewöhnlicher Wortgebrauch

`generate-ambiguity-lexicon.py` filtert die auf Wortarten annotierten Textdaten von Universal Dependencies German-GSD auf gewöhnliche Wortformen (ohne `PROPN`) und bildet eine Schnittmenge mit GeoNames-Ortsnamen. Nur diese Schnittmenge wird im HTML als kleine `Set`-Struktur vorgehalten. Ein im gewöhnlichen Korpus nicht belegter Begriff gilt **nicht** automatisch als eindeutiger Ortsname. Für Einwort-Ortsnamen ohne Kontext wird ein weiterer, aus GeoNames-Bevölkerungszahlen erstellter Schwellenwert genutzt. [Detailmethodik](COMMON_WORDS.md).

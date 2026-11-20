# Architektur – Anonymat 2.0 (Alpha)

## Kette der Regeln

1. **Basisdetektoren (\`detect.ts\`)** erkennen kontextuelle Namen, Telefonnummern, gültige IBAN und E-Mail. Das Ergebnis sind Vorschläge mit UTF-16-Start/End-Offsets. Keine Ausgabe im Text wird hier verändert.
2. **Erlernte Dokumentbegriffe (\`term-index.ts\`)** erkennen vollständige Wörter mit Aho-Corasick als einmaligen Mehrfachscan. Aus „Frau Müller“ wird „Müller“ unabhängig von der Fundstelle erkannt, ebenso explizit markierte Texte. Alle Daten bleiben lokal.
3. **Benutzerregeln (\`overrides.ts\` und \`scanDocument\`)** gewinnen vor automatisch erkannten, überlappenden Kandidaten. Beispiel: „Anna Müller“ wird als Vorname „Anna“ und Nachname „Müller“ klassifiziert. Eine manuelle Auswahl erstellt Anker plus eine dokumentlokale Suchregel.
4. **Review (\`session.ts\`)** wendet lokale und globale Ignorierregeln an und gruppiert Fundstellen für die UI. Ignorierregeln erzeugen *keine* zusätzlichen Treffer.
5. **Ersetzung (\`replacement-strategies.ts\` + \`replace.ts\`)** verarbeitet nur freigegebene Fundstellen. Derzeit aktiv: automatisch generierte Tokens oder benutzerdefinierte eindeutige Tokens. Die Zuordnung enthält die genaue Originalschreibweise.
6. **Rückübersetzung (\`restoreText\`)** ersetzt in einem Durchlauf die bekannten Tokens innerhalb der simulierten/external verarbeiteten Texte. Fehlende/unerwartete Tokens werden gemeldet.

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

## Erweiterungspunkte (noch NICHT verfügbar)

Künftige Regeln könnten sein: \`shift-date\`, \`shift-time\`, \`synthetic-name\`, \`synthetic-email\`. Sie sind in \`replacement-strategies.ts\` ausdrücklich als geplante Modi abgegrenzt; sie werden **nicht** in \`replace.ts\` ausgeführt.

Besonders für datums- und uhrzeitbasierte Ersetzung müssen Parser/Formatter unabhängig von der Sprache des KI-Texts sein, dürfen ausschließlich eindeutige Daten verändern und müssen die Umkehrrechnung auf echte wiedererkannte Daten begrenzen. Zufallsoffsets sind nur Pseudonymisierung, nicht garantierte Anonymisierung.

## Leistungsziele und Grenzen

- Der Mehrfachindex läuft asymptotisch in O(Textlänge + Gesamtlänge der Suchbegriffe + Treffer) statt bei vielen Begriffen jeweils den Text erneut zu scannen.
- Bekannte RegEx werden separat einmal je Muster angewendet.
- \`removeOverlaps\` verarbeitet Kandidaten derzeit bei vielen Überlappungen noch quadratisch; erst optimieren, wenn Messungen dies erfordern.
- Bei großen Dokumenten kann das vollständige Neuscannen nach jedem Tastendruck die UI blockieren. Für längere Texte künftig Debounce/Worker *ohne Datenversand* erwägen und mit Lasttests prüfen.
- Vollständige medizinische oder allgemeine PII-Erkennung wird nicht garantiert.
- Keine serverseitigen Dienste, kein CDN, keine persistente Ablage von Originalen oder Zuordnungen.

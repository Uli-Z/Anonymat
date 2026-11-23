# Architektur – Anonymat 2

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

## Datumsangaben und Rückübersetzung

`dates.ts` und `partial-dates.ts` erkennen vollständige und unvollständige Datumsangaben. Einzelne Fundstellen bleiben auch in kompakten Schreibweisen getrennt editierbar. Der optionale Datumsversatz ist innerhalb einer Sitzung konsistent; die Rückübersetzung kann neben unveränderten verschobenen Daten auch aus ihnen abgeleitete Kalenderdaten umkehren. Nicht eindeutig rekonstruierbare Angaben erfordern eine Sichtprüfung.

`replace.ts` stellt bekannte Tokens und Pseudonyme anhand der Sitzungseinträge wieder her. Nicht mehr in einer KI-Antwort vorkommende ursprüngliche Daten sind kein eigener Fehler. Umdeutungen durch externe Tools, gleichlautende Pseudonyme oder mehrdeutige Kalenderdaten können die Rückübersetzung weiterhin beeinträchtigen.

## Leistungsziele und Grenzen

- Der Mehrfachindex läuft asymptotisch in O(Textlänge + Gesamtlänge der Suchbegriffe + Treffer) statt bei vielen Begriffen jeweils den Text erneut zu scannen.
- Bekannte RegEx werden separat einmal je Muster angewendet.
- \`removeOverlaps\` verarbeitet Kandidaten derzeit bei vielen Überlappungen noch quadratisch; erst optimieren, wenn Messungen dies erfordern.
- Die Analyse läuft für größere Texte in einem eingebetteten Web Worker mit Debouncing und Stale-Result-Schutz. Langsame Geräte und große Dokumente erfordern weiterhin Performance-Tests.
- Vollständige medizinische oder allgemeine PII-Erkennung wird nicht garantiert.
- Keine serverseitigen Dienste, kein CDN, keine persistente Ablage von Originalen oder Zuordnungen.

## POS-basierter gewöhnlicher Wortgebrauch

`generate-ambiguity-lexicon.py` filtert die auf Wortarten annotierten Textdaten von Universal Dependencies German-GSD auf gewöhnliche Wortformen (ohne `PROPN`) und bildet eine Schnittmenge mit GeoNames-Ortsnamen. Nur diese Schnittmenge wird im HTML als kleine `Set`-Struktur vorgehalten. Ein im gewöhnlichen Korpus nicht belegter Begriff gilt **nicht** automatisch als eindeutiger Ortsname. Für Einwort-Ortsnamen ohne Kontext wird ein weiterer, aus GeoNames-Bevölkerungszahlen erstellter Schwellenwert genutzt. [Detailmethodik](COMMON_WORDS.md).

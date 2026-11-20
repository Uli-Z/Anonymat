# Anonymat 2.0 – Entwicklungsplan

**Status:** beschlossenes Zielkonzept für die Neuentwicklung (20.11.2026)  
**Repository:** Uli-Z/Anonymat  
**Stand des bestehenden Programms:** 0.9.3 (Vanilla JavaScript, Python-Single-HTML-Build)  
**Umsetzung:** bestehendes Repository weiterverwenden; alten Stand als Tag sichern; neue Implementierung auf einem separaten Branch entwickeln.

## 1. Produktziel

Anonymat ist ein **lokales, teilautomatisiertes Werkzeug zur Pseudonymisierung von Texten**, insbesondere vor der Weitergabe an externe KI-Systeme für Übersetzung, Überarbeitung oder Zusammenfassung. Nach der Bearbeitung sollen Platzhalter lokal wieder in die Originalwerte zurückübersetzt werden können.

Die Anwendung ist ein **intelligenter Textmarker mit automatischen Erkennungsvorschlägen und verpflichtender menschlicher Sichtprüfung**, kein System mit Garantie auf vollständige Anonymisierung.

### Nicht verhandelbare Anforderungen

- Das fertige Programm besteht aus **einer einzigen HTML-Datei**, die ohne Installation und ohne Internetverbindung per Doppelklick geöffnet werden kann (file://).
- Die Verarbeitung läuft ausschließlich lokal im Browser; **keine Datenübertragung, kein Backend, kein CDN, keine Telemetrie**.
- Ein **einziges allgemeines Erkennungsprofil** in Version 2.0. Keine Profileverwaltung, kein gesondertes medizinisches Profil.
- Mehrere einfache, kombinierbare Erkennungsstrategien und ein sehr schneller manueller Prüf- und Markierungsworkflow.
- Pseudonymisieren → Text für KI kopieren → bearbeiteten/übersetzten Text einfügen → lokal rückübersetzen.
- Keine automatische Speicherung sensibler Inhalte oder der Zuordnungsliste. Insbesondere darf beim Download/Speichern des Programms **kein Sitzungstext oder Mapping** in der HTML-Datei landen.
- Bewusst schlank bleiben: keine Benutzerkonten, Cloud, Plugins, externe APIs oder überladene Einstellungsoberfläche.

## 2. Funktionsumfang 2.0 (Muss)

### 2.1 Erkennungsstrategien

Alle Detektoren geben eine gemeinsame strukturierte Trefferliste zurück: Start-/Endposition, erkannter Text, Kategorie, Quelle/Strategie und eine heuristische Priorität bzw. Sicherheit (nicht als statistische Wahrscheinlichkeit ausgeben).

1. **Muster / reguläre Ausdrücke mit Validierung:** E-Mail-Adressen, Telefonnummern, IBAN (inklusive Prüfziffer), URLs soweit identifizierend, Datumsangaben, PLZ mit Kontext, typische Akten-/Kunden-/Patientenkennungen, wo durch präzise Muster erkennbar.
2. **Lokale Wortlisten:** häufige Vornamen, häufige Nachnamen, Orte, häufige Straßennamen und Namensbestandteile. Wortlisten sind in die Single-HTML-Datei eingebettet; Quellen, Lizenzen und Größe vor Aufnahme prüfen. Treffer nur mit passendem Kontext oder Kombination bevorzugen, z. B. Vorname + Nachname, Straße + Hausnummer.
3. **Kontextregeln:** „Herr“, „Frau“, „Dr.“, „geboren am“, „wohnhaft in“, „Patienten-Nr.“ und Ähnliches, auch als Ergänzung zu Wortlisten.
4. **Manuell:** beliebigen Bereich markieren und direkt als Platzhalter übernehmen; Treffer abwählen, korrigieren, Kategorie wechseln oder von zukünftiger Erkennung ausnehmen.

**Prioritäten:** möglichst viele plausible PII-Kandidaten sichtbar machen, dabei erkennbare medizinische Zahlen, Dosierungen, Messwerte und fachliche Zahlen **nicht pauschal** ersetzen. Keine generische Regel „jede Zahl ab drei Stellen“. Konflikte/Überlappungen zentral auflösen; Originalpositionen zur Verarbeitung verwenden statt globale blinde String-Ersetzungen.

### 2.2 Manuelle Kontrolle / UI

- Ein zentraler Editor mit inline hervorgehobenen Kandidaten, nach der Analyse einfach durchlesbar.
- Klick auf Treffer: anonymisieren/bestätigen, ignorieren oder Kategorie ändern.
- Text markieren: kleine Kontextaktion „Als … maskieren“, mit sinnvoller Standardkategorie und automatischer Platzhaltervergabe; möglichst wenige Klicks.
- Optional gleicher Begriff im ganzen Dokument anwenden; im UI erkennbar machen, ob einzelne Stelle oder alle Vorkommen betroffen sind.
- Rückgängig/Wiederholen, Tastaturbedienung und ein klarer Kopieren-Button.
- Originaltext bleibt als unveränderliche Referenz während einer Verarbeitung erhalten; separate Ergebnisansicht oder umschaltbare Vorschau. Es darf keine unbemerkte Überschreibung des Originals geben.
- Pseudonymisierungs- und Rückübersetzungsmodus möglichst einfach, ohne Wizard.
- Deutsch als Ausgangssprache der UI, Englisch optional; Übersetzungs-/Datumsfunktionen davon unabhängig.

### 2.3 Platzhalter und Rückübersetzung

- Einheitliche, stabile Tokens, z. B. [PERSON_001], [EMAIL_001], [ADDRESS_001].
- Gleiche erkannte Entität wird innerhalb der Sitzung konsistent ersetzt, soweit eindeutig.
- Eindeutige und kontrollierte Zuordnung der Tokens zu Originalwerten; keine fehleranfälligen Teiltreffer.
- Wiedereinfügen extern verarbeiteter Texte und lokales Zurücksetzen der Tokens.
- Fehlende, beschädigte, verdoppelte oder von einer KI umformulierte Tokens erkennen und **warnen statt stillschweigend falsch rekonstruieren**.
- Keine Aussage, dass ein Text nach der Bearbeitung automatisch sicher anonymisiert sei.

## 3. Spezialfunktion: konsistente Datumsverschiebung

**Ziel:** Chronologie und zeitliche Intervalle erhalten und zugleich identifizierende Kalendertage pseudonymisieren. Datumsangaben sollen nach einer KI-Übersetzung in einer anderen Sprache lokal wieder auf die Originaldaten zurückgeführt werden können.

### Algorithmus

- Ein zufälliger, konfigurierbarer **ganzzahliger Offset in Kalendertagen** wird pro Text/Sitzung erzeugt (kryptografisch sicherer Zufall über Web Crypto; sinnvoll begrenzter Wertebereich und optional manuell einstellbar).
- **Alle eindeutig erkannten vollständigen Kalenderdaten** werden um denselben Offset verschoben. Reihenfolge und Abstände in Tagen bleiben dadurch exakt erhalten.
- Berechnung auf Basis neutraler Kalendertage/ISO-Daten (keine lokalen Zeitstempel-Arithmetik mit Sommerzeitproblemen).
- Bei der Rückübersetzung Offset mit umgekehrtem Vorzeichen anwenden. Im einfachen Fall genügt die Speicherung **eines Offsets**, nicht einer individuellen Original-zu-Ersatz-Datumsliste.
- **Vier Sprachen:** Deutsch, Englisch, Französisch und Spanisch (de/en/fr/es) mit numerischen und ausgeschriebenen Monatsangaben, kurzen Monatsnamen und typischen Sprachmustern.
- Interne Schichten: **Datum finden → eindeutig parsen → ISO-Kalendertag → Offset → sprachabhängig ausgeben**. Bei Rückübersetzung in der Sprache des KI-Ergebnisses parsen und wieder in dieser Sprache formatieren.
- Beispiel: 10.03.2026 → (+30 Tage) 09.04.2026 → KI übersetzt „9 avril 2026“ → lokal (−30 Tage) „10 mars 2026“.
- Wenn Wochentage im selben Ausdruck vorkommen, müssen diese passend berechnet und geprüft werden.

### Bewusste Einschränkungen

- In 2.0 zunächst nur **vollständige, eindeutig interpretierbare Datumsangaben mit Jahr** automatisch verschieben. Monatsangaben ohne Tag, Tages-/Monatsangaben ohne Jahr, relative Daten („vor zwei Wochen“), Zeitspannen mit offenen Enden und Uhrzeiten erfordern separate spätere Regeln oder manuelle Markierung.
- Mehrdeutige numerische Angaben wie 04/05/2026 dürfen nicht blind zwischen US- und europäischen Formaten interpretiert werden; explizite Formateinstellung oder manuelle Klärung.
- Bei ungültigen Kalendertagen, widersprüchlichen Wochentagen und umformulierten Datumsangaben warnen.
- Besondere Schutzregel beim Rückübersetzen: Ein von der KI **neu eingefügtes** Datum könnte sonst irrtümlich zurückverschoben werden. Deshalb nach Möglichkeit die Menge der im exportierten Text tatsächlich verwendeten **verschobenen Kalendertage** als minimale Prüfmetadaten in der Sitzung führen und unzuordenbare neue Daten nicht automatisch verändern. Der Offset bleibt die Rechenregel; die Prüfliste dient nur der Erkennung unklarer Fälle.
- Datumsverschiebung ist **Pseudonymisierung**, keine garantierte Anonymisierung. Bei bekanntem Ereignis und indirekten Merkmalen kann Rückidentifizierung möglich bleiben.
- Bestehende date.js-Formate und Sprachlisten als Ausgangsmaterial für Tests übernehmen, aber die Datums-Engine neu implementieren.

## 4. Technologie und Architektur – absichtlich klein

- **Svelte 5 + TypeScript** für Oberfläche und Zustandsverwaltung.
- **Vite + vite-plugin-singlefile** für die Erstellung einer vollständigen Offline-HTML-Datei mit eingebetteten Styles, Skripten, Icons und Wörterbüchern.
- Die Erkennungs- und Ersetzungslogik ist **framework-unabhängig** als reine TypeScript-Funktionen testbar.
- **Vitest** für Logik- und Regressionstests; wenige **Playwright**-Smoke-Tests für den echten Browser und die fertige file://-Datei.
- **GitHub Actions:** Typprüfung, Unit-Tests, Browser-Smoke-Tests, Single-HTML-Build und Release-Artefakt.
- Kein SvelteKit und kein Backend; keine Laufzeit-Abhängigkeiten von externen Ressourcen.
- Eine lokale ML-/NER-Komponente (z. B. kleines mehrsprachiges Modell via WebAssembly/Transformers.js) ist **nur als späterer optionaler Detektor** vorgesehen. Sie darf nicht Voraussetzung für Version 2.0 sein.

### Vorgeschlagene minimalistische Struktur

```text
src/
  App.svelte
  components/
    Editor.svelte
    Toolbar.svelte
  lib/
    detect.ts          # Zusammenführen von Kandidaten und Konfliktlösung
    patterns.ts        # RegEx-Detektoren
    dictionaries.ts    # Wörterbuch-/Kontextstrategien
    dates.ts           # Datumsparser, Kalender-Offset, Formatierung
    replace.ts         # Token-Mapping, Pseudonymisieren, Rückübersetzen
data/
  firstnames.json
  surnames.json
  places.json
tests/
.github/workflows/
vite.config.ts
package.json
PLAN_V2.md
```

Struktur bei Bedarf erweitern, aber **keine vorsorgliche Überarchitektur** schaffen.

## 5. Entwicklungsreihenfolge

### Phase 1 – Funktionsfähiges Grundgerüst
- Svelte-/TypeScript-/Vite-Projekt im Entwicklungsbranch einrichten; alte Version per Tag schützen.
- Offline-Single-HTML per file:// starten, ohne Netzwerkzugriffe.
- Schlanken Editor mit Text markieren, Kandidaten anzeigen und manuell Platzhalter vergeben.
- **Fertig, wenn:** Ein Text lokal eingefügt, manuell maskiert, kopiert und fehlerfrei rückübersetzt werden kann.

### Phase 2 – Automatische Erkennung
- Regex-Strategien plus Validierung, kuratierte Namens- und Orts-/Straßenwortlisten und einfache Kontextregeln.
- Kandidatenliste, stabile Tokens, Overlap-Handling, Bestätigen/Ablehnen und erneutes Scannen.
- Synthetische allgemeine und medizinische Beispieltexte als Tests; niedrige Anzahl störender Fehlalarme ohne stilles Verschweigen unsicherer Kandidaten.
- **Fertig, wenn:** Automatische und manuelle Markierungen konfliktfrei zusammenarbeiten und Rückübersetzung funktioniert.

### Phase 3 – Datumsverschiebung und Übersetzung
- Einheitlicher Tagesoffset, Datumserkennung/parsing/formatting in de/en/fr/es, inverse Verarbeitung.
- Tests mit Monatswechsel, Jahreswechsel, Schaltjahr, Wochentagen, übersetzten Monatsnamen und Mehrdeutigkeiten.
- Erkennen, wenn KI Änderungen an Datumsdarstellungen oder Platzhaltern vorgenommen hat; sichere Warnungen bei nicht reproduzierbarer Rückführung.
- **Fertig, wenn:** Eindeutige vollständige Daten behalten ihre Abstände und lassen sich nach Übersetzung in den vier Sprachen zurückverschieben.

### Phase 4 – Qualität und Release
- UI vereinfachen und vereinheitlichen, Tastatur- und Mobilbedienbarkeit verbessern.
- Datenschutz- und Sicherheitsprüfung, keine Sitzungstexte im Download, keine externen Requests.
- CI muss **tatsächlich Tests ausführen**, nicht nur ein Test-Bundle erzeugen.
- Versioniertes Single-HTML als GitHub-Release erstellen; README mit ehrlicher Beschreibung und Einschränkungen aktualisieren.
- **Fertig, wenn:** Die HTML-Datei offline in aktuellen Firefox-/Chrome-/Edge-Browsern läuft und die Test-Suite grün ist.

## 6. Nicht Teil des ersten Releases

- Mehrere Erkennungsprofile oder medizinische Sonderprofile.
- Große vortrainierte KI-Modelle, GPU-Zwang oder große WASM-Pakete.
- Vollständige europäische Adressdatenbank.
- OCR, PDF-, DOCX- oder Bildverarbeitung.
- Synchronisierung, Accounts, Cloud, externe API-Anbindung.
- Garantie der Vollständigkeit oder rechtliche Behauptung automatischer DSGVO-Konformität.
- Automatische semantische Auflösung sämtlicher relativer Zeitangaben.

## 7. Arbeits- und Qualitätsprinzipien

1. **Bestehende Version nicht überschreiben**, bevor die 2.0-Implementierung getestet ist. Separater Entwicklungsbranch, kleine PRs.
2. **Manueller Workflow ist immer die Rückfallebene.** Automatische Treffer sind Vorschläge, keine endgültige Entscheidung.
3. **Klare Grenzen benennen:** Lokale Verarbeitung und Pseudonymisierung allein erlauben nicht jede Weitergabe an KI-Dienste.
4. **Nicht mehr bauen als benötigt:** Neue Komponenten nur, wenn sie einen konkreten Anwendungsfall vereinfachen.
5. **Fehler lieber sichtbar machen:** Beim Parsen, Überlappen oder Wiederherstellen keine stillen Datenveränderungen.
6. **Reproduzierbarkeit:** Wörterbuchquellen/Lizenzen und Tests dokumentieren; Build soll deterministisch sein.

## 8. Nächster konkreter Schritt

Auf einem neuen Entwicklungsbranch zuerst **Phase 1** umsetzen: Svelte-Projekt mit Single-HTML-Build, minimaler Editor, manuelle Markierung, stabile Platzhalter und Roundtrip. Dann die Erkennungsstrategien schrittweise ergänzen. Das Planungsdokument bleibt auf main auffindbar und kann mit konkreten Erkenntnissen aktualisiert werden.


## 9. Implementierungsstand (20.11.2026)

**Phase 1 – technisches Grundgerüst umgesetzt:**
- Neue Svelte-5-/TypeScript-Anwendung unter \`v2/\`; Legacy-Anwendung bleibt im Repository-Root unverändert.
- Vite + vite-plugin-singlefile erzeugt \`v2/dist/index.html\`; automatische Prüfung des eigenständigen HTML-Bundles.
- Grundoberfläche mit Originaltext, automatischen Treffer-Vorschlägen, manueller Markierung, Auswahl der aktiven Treffer, Vorschau und Kopieren.
- Lokale Wiederherstellung aus KI-Antworttext mit Warnung bei fehlenden oder unbekannten Platzhaltern.
- Erste, bewusst einfache RegEx-/Kontextdetektoren für E-Mail, IBAN, bestimmte Telefonnummern und Namen nach Anreden; noch **keine Wortlisten und keine Datumsverschiebung**.
- GitHub Actions prüft Svelte/TypeScript, Unit-Tests und Single-HTML-Build. GitHub Pages veröffentlicht Legacy im Root und V2 unter \`/v2/\`.

**Nächster Schritt:** praktische Prüfung des UI im Browser (insbesondere manuelle Markierung, Clipboard und mobile Bedienung), dann Wortlisten/Kontextregeln. Die Datei bleibt ein Alpha-Prototyp und darf vorerst nicht als vollständige Anonymisierungslösung beworben werden.


## 10. Neue Regel- und Testarchitektur (20.11.2026, Alpha 3)

**Umgesetzt:**
- Ebenenmodell für Erkennungen, erlernte Begriffe, manuelle Überschreibungen, lokale/globale Ausschlüsse, Ersetzungswerte und Rückübersetzung. Siehe \`v2/docs/ARCHITECTURE.md\`.
- Nutzer können automatisch erkannte Namen im Text in **Vorname** und **Nachname** trennen oder manuell eine Kategorie überschreiben. Bei komplexen Namen wird bewusst keine automatische Trennung geraten.
- Die Ersetzungsliste zeigt tatsächliche Platzhalter und erlaubt **editierbare, eindeutige benutzerdefinierte Tokens** wie \`[PATIENT_A]\`. Freitext wird bislang nicht zugelassen, weil seine sprachübergreifende Rückübersetzung nicht zuverlässig wäre.
- Dokumentweit gelernte Namen und manuelle Begriffe werden mit einem eigenen Aho-Corasick-Mehrfachsuchindex statt wiederholten Regex-Suchen verarbeitet. Es gibt Unicode-, Spezialzeichen- und Lasttests.
- In \`v2/tests/fixtures/translation/\` liegen synthetische deutsch-englische, deutsch-französische und deutsch-spanische KI-Rückgaben. Die Rückübersetzungslogik wird über Vitest und Browser-Tests automatisch geprüft.
- **Grenze:** Die Tests überprüfen deterministisch den Umgang mit Übersetzungen und Platzhaltern, nicht die Qualität realer KI-Übersetzungen. Die Datumsverschiebung und synthetische Personennamen/E-Mail-Adressen sind weiterhin offen. Datumstests stehen als TODO, nicht als bestandene Fälle.

**Nächste Schritte:** Im Anschluss die Datums-/Uhrzeitengine mit de/en/fr/es sicher implementieren und auf den bereits definierten Datumsfixtures prüfen; erst danach synthetische Namen/E-Mail-Adressen als gesonderte Ersetzungsmethoden bewerten. Vor einer produktiven Nutzung weiter vollständige menschliche Sichtprüfung verlangen.

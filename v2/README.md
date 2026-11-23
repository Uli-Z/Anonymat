# Anonymat 2.0 – UI- und Technik-Prototyp

Die bisherige Version 0.9.3 bleibt im Root des Repositories erhalten. Die Svelte-5-Anwendung wird unabhängig in v2/ entwickelt.

## Funktionen im Alpha-Prototyp

- Lokaler Texteditor mit Live-Vorschlägen für E-Mail, URLs, IBAN/BIC, Telefonnummern, IP-Adressen, kontextgebundene Akten-/Patientennummern, Kfz-Kennzeichen, Straßen, Hausnummern, PLZ und Städtenamen. Namen werden auch nach Anreden, bei Namensfeldern und mit deutschen Genitivformen (z. B. „des Herrn Müller“, „Müllers“) erkannt. Aus „Frau Müller“ wird „Müller“ für alle Vorkommen im aktuellen Dokument gelernt – auch vor der Anrede oder wenn der Name erst später eingetippt wird.
- Einzelne häufige Vornamen wie „Peter“ und „Ulrich“ werden bei personenbezogenem Satzkontext erkannt; isolierte Namen ohne solchen Kontext werden als **Prüfvorschläge** sichtbar, aber noch nicht ersetzt. Ein Klick bestätigt den Kandidaten als dokumentweit gelernte Regel. Die Trefferliste und der Ergebnisbereich weisen auf offene Prüfvorschläge hin. Gewöhnliche Begriffe wie „Krankenhaus“ werden nicht allein durch Wörterbuchtreffer oder eine Ortspräposition zu Straßennamen.
- Beliebige Textauswahl mit **einem Klick** auf die eingeblendete Aktion „Auswahl pseudonymisieren“ markieren; die gewählte Stelle lehrt Anonymat den gleichen Begriff für weitere Vorkommen.
- Automatische und manuelle Treffer sind direkt im Originaltext farblich hervorgehoben und anklickbar.
- Kontextmenü zum Ändern des Platzhaltertyps, Entfernen/Ignorieren einer Stelle oder Ignorieren eines Begriffs im gesamten Text.
- Pro Begriff gruppierte Trefferliste (z. B. „Müller × 3“) statt doppelter Zeilen; die Checkbox schaltet alle Vorkommen um. Im Text lässt sich separat genau eine Stelle ignorieren.
- Vorschau des pseudonymisierten Textes und Kopieren in die Zwischenablage.
- KI-Antwort mit Platzhaltern einfügen und lokal zurückübersetzen; Warnungen bei fehlenden/unbekannten Tokens.
- Keine Speicherung vollständiger Texte oder Token-Zuordnungen. Kein Backend. Nach Zustimmung können **einzelne manuell bestätigte Begriffe und Kategorien** dauerhaft im Browser gespeichert werden.

**Alpha-Hinweis:** Die Erkennung ist unvollständig. Vor der Weitergabe vertraulicher Daten ist eine gründliche menschliche Prüfung erforderlich.

Die Oberfläche arbeitet in drei Schritten: **Originaltext bearbeiten → pseudonymisierten Text prüfen → KI-Ergebnis zurückübersetzen**. Der Originaleditor bleibt während der Analyse in seiner Größe stabil. Die Ergebnisvorschau wird erst über „Ergebnis prüfen“ geöffnet; nach jeder Änderung am Original, an Markierungen oder Einstellungen muss die neue Fassung erneut geprüft werden, bevor sie kopiert werden kann. Die Liste mit allen Ersetzungen ist über „Ersetzungen anzeigen“ als Dialog erreichbar. Der Analysefortschritt erscheint nur während der Verarbeitung und liegt außerhalb des Seitenlayouts.

Datumsverschiebung ist **standardmäßig aktiviert**: Ein gemeinsamer kryptographisch zufällig gewählter Tagesoffset verschiebt vollständige Kalenderdaten, erhält bekannte Zeitabstände und kann in Deutsch, Englisch, Französisch oder Spanisch rückgängig gemacht werden. Der genaue Versatz wird im Hauptfenster nicht angezeigt und bei „Neuer Text“ neu erzeugt. Unter **Einstellungen** lässt er sich neu auslosen, manuell festlegen oder deaktivieren. Mehrdeutige Zahlenformate und die Offline-Ortserkennung sind ebenfalls dort konfigurierbar.

**Jahrfreie Daten mit Tag und Monat** wie `10. März`, `March 10` oder `10.03.` werden ohne Benutzereingabe anhand eines festen internen Schaltjahrs verschoben. Das Bezugsjahr wird nicht angezeigt und niemals dem exportierten Text hinzugefügt. Die konkreten Zuordnungen der verschobenen Angaben werden nur im Arbeitsspeicher des Tabs für die Rückübersetzung gespeichert. Ohne das tatsächliche Jahr lassen sich Kalenderbeziehungen zu anderen Daten – insbesondere Wochentagen oder Schaltjahresgrenzen – nicht immer zuverlässig überprüfen. Angrenzende Wochentage führen deshalb zum Platzhalter-Fallback. **Monat+Jahr, reine Monats-, Tages- und Jahresangaben** wie `März 2026`, `03/2026` oder `im März` bleiben Platzhalter, da kein Kalendertag bestimmt werden kann. Eindeutige numerische Tages-/Monatswerte ohne Kontext werden wegen möglicher Dezimal-/Messwerte nicht automatisch klassifiziert; mehrdeutige Tages-/Monatsreihenfolgen benötigen eine explizite Einstellung.

Ein offline eingebettetes europäisches Ortslexikon mit einem POS-basierten Abgleich gegen gewöhnliche deutsche Wörter ergänzt die Regeln; für die GitHub-Pages-Version wird es beim Build aus GeoNames (CC BY 4.0) erstellt. Die mitgelieferte Entwicklungsversion enthält eine kleinere Startliste. Siehe [Ortslexikon und Grenzen](docs/CITY_LEXICON.md).

## Entwicklung

Voraussetzung: Node.js 22.12+.

    cd v2
    npm install
    npm run dev
    npm run verify

npm run build erzeugt dist/index.html, eine **einzelne vollständig eingebettete HTML-Datei**, die per Doppelklick geöffnet werden kann. Die Build-Prüfung lehnt fehlende oder nach außen verlinkte Skript-/Stylesheet-Dateien ab.

Vor einem vollständigen Offline-Build kann das GeoNames-Lexikon generiert werden: `python3 scripts/generate-city-lexicon.py`. Bei Push auf main veröffentlicht GitHub Actions die bisherige Version im Root und das V2-Bundle unter **/v2/**.

## Datenschutz

Vollständige Texte, Rückübersetzungsdaten und Token-Zuordnungen bleiben im Arbeitsspeicher dieses Browser-Tabs. **Optionaler lokaler Lernspeicher:** Nur nach ausdrücklicher Zustimmung speichert Anonymat manuell bestätigte Originalbegriffe mit Kategorie in IndexedDB. Diese können personenbezogene Daten sein und liegen dort unverschlüsselt im jeweiligen Browserprofil. Ohne Zustimmung wird keine solche Regel gespeichert. In den Einstellungen können Begriffe geändert, einzeln gelöscht oder vollständig entfernt werden. Auch direkt am markierten Begriff und in der Ersetzungsliste gibt es die Aktion „Aus Gedächtnis löschen“. Das Deaktivieren einer einzelnen Stelle oder eines Begriffs im aktuellen Text löscht die gespeicherte Regel dagegen **nicht** automatisch. Keine Modellaufrufe, keine Analytik. Manuelle Markierungen und lokale Ausnahmen werden bei Texteingaben positionsgenau mitverschoben. Nur vollständig gelöschte Markierungen oder geänderte, bewusst ignorierte Texte werden neu bewertet.

**Pseudonymisierung ist nicht gleich Anonymisierung.** Auch nach Ersetzungen können indirekte Identifikatoren im Text verbleiben.


## Regelpipeline und Tests (Alpha 3)

Die neue **Prioritätsfolge** lautet: automatische Detektoren → dokumentweit gelernte Begriffe → explizite manuelle Klassifizierung (überschreibt Auto-Erkennung) → lokale/globale Ausnahmen → Ersetzungsregel → Wiederherstellung.

Die Kategorie kann im Kontextmenü manuell auf **Vorname**, **Nachname**, **Datum** oder **Uhrzeit** geändert werden. Bei genau zweigliedrigen vollständigen Namen steht die Aktion **„In Vorname und Nachname aufteilen“** zur Verfügung; mehrdeutige Namen werden nicht automatisch zerlegt.

Die Ersetzungsliste zeigt den konkret eingesetzten Token und ermöglicht seine Bearbeitung. Benutzerdefinierte Tokens müssen eindeutig und in eckige Klammern gesetzt sein, z. B. \`[PATIENT_A]\`. Freitext wird bewusst nicht akzeptiert, da er sich nach einer KI-Übersetzung derzeit nicht zuverlässig rekonstruieren ließe. Die Datumsverschiebung für vollständige Datumsangaben und automatisch für Tag+Monat ohne Jahr ist umgesetzt; andere unvollständige Datumsangaben werden als Token geschützt. Uhrzeitverschiebung und synthetische Namen/E-Mail-Adressen sind **noch nicht implementiert**.

Für viele gelernte Wörter verwendet die Erkennung einen **Aho-Corasick-Mehrfachsuchindex** statt eines regulären Ausdrucks pro Begriff. Manuelle Treffer bleiben im Editor über ihre Textposition verankert.

Ausführung:

    npm run test:rules
    npm run test:translation
    npm run test:e2e

Unter \`tests/fixtures/translation/\` liegen **synthetische** deutsch-englische, -französische und -spanische Texte mit stabilen Platzhaltern. Diese prüfen die **Rückübersetzung** nach simulierten KI-Antworten, **nicht** die Übersetzungsqualität eines realen Modells. Die Datumsbeispiele in \`future-date-cases.json\` werden jetzt durch \`dates.test.ts\` ausgeführt. Details: [Testkonzept](docs/TESTING.md) und [Architektur](docs/ARCHITECTURE.md).

Ortsnamen-Mehrdeutigkeiten werden aus **Universal Dependencies German-GSD (CC BY-SA 4.0)** mit `NOUN`/`VERB`/`ADJ` usw. gegenüber `PROPN` automatisch abgeleitet – nicht aus einer handgepflegten Liste. Fehlende Evidenz ist kein Beweis für einen eindeutig geografischen Begriff; daher werden kleinere Einwort-Orte ohne Ortskontext weiterhin nicht automatisch markiert. [Methodik und Lizenz](docs/COMMON_WORDS.md).

## Leistungsfähige Lexika und asynchrone Analyse (Alpha 6)

Die Builds von CI und GitHub Pages ergänzen die lokal gespeicherten Lexika mit Vornamen und Nachnamen aus Onomaverse (CC BY 4.0) sowie deutschen Straßen aus OpenPLZ/OpenStreetMap (ODbL 1.0). In einer CI-Messung vom 21.11.2026 waren **120.407 Ortsnamen, 292.142 Straßennamen, 18.150 Vornamen und 19.767 Nachnamen** vorhanden. Die automatische Erkennung verwendet Hashtabellen statt einzelner regulärer Ausdrücke je Lexikoneintrag; Namen und Straßen werden aus Datenschutz- und Präzisionsgründen kontextabhängig erkannt.

Die zeitintensive Analyse läuft in einem **inline Web Worker** (keine externen Skripte). Der Editor wartet nach dem Tippen 150 ms, verarbeitet veraltete Resultate nicht, erlaubt Abbrechen/Neustarten und zeigt einen schrittbasierten Ladebalken. Solange eine aktuelle Analyse fehlt, ist die Textausgabe sicherheitshalber gesperrt. Auch eine manuelle Korrektur startet eine neue Hintergrundanalyse.

Benchmark in GitHub CI (vorläufig, nur warme Indizes): 10 KB ~21 ms, 100 KB ~208 ms, 1 MB ~2.155 ms. Kalte Worker-Startzeit und DOM-Rendering sind nicht enthalten. [Herkunft, Lizenzen, Benchmark und Grenzen](docs/PERFORMANCE_AND_LEXICA.md).

## Wiederkehrende manuelle Ersetzungen

Manuelle Markierungen gelten weiterhin sofort für alle Vorkommen im aktuellen Text. Beim ersten manuellen Markieren wird gefragt, ob Anonymat sich die Begriffe für neue Texte merken darf. Das lässt sich später unter **Einstellungen → Gelernte Ersetzungen** ändern. Gespeicherte Begriffe werden bei neuen Texten **immer direkt pseudonymisiert**; eine zusätzliche Auto-Übernahme-Checkbox gibt es nicht mehr. Nur unsichere Mustererkennungen sind orange gestrichelte, noch nicht ersetzte Prüfvorschläge. Eine gespeicherte Regel kann direkt im Menü des erkannten Begriffs oder in der Ersetzungsliste („Aus Gedächtnis löschen“) entfernt werden; dies wirkt für zukünftige Texte. Dagegen betrifft „Nur diese Stelle nicht ersetzen“ ausschließlich das aktuelle Dokument. Auch nach Löschen des Gedächtniseintrags können unabhängig davon die gewöhnlichen automatischen Detektoren einen Begriff weiterhin erkennen. Automatische Mustererkennung bleibt unabhängig davon aktiv.

Wenn nach dem Einfügen eines neuen Textes **mehr als zwei noch offene Vorschlagsgruppen aus der Mustererkennung** bestehen, erscheint nach kurzer Eingabepause ein einmaliger Sammeldialog. Man kann alle bestätigen, jeden Vorschlag über die Ersetzungsliste einzeln prüfen oder den Dialog schließen. Automatisch sichere Treffer bleiben unabhängig davon aktiv. Beim Wechsel zu **Neuer Text** wird nur der aktuelle Arbeitsstand verworfen, nicht das lokale Gedächtnis. Bei Löschung der Browser-Website-Daten kann das Gedächtnis verloren gehen; der Lernspeicher wird nicht zwischen Geräten oder Browserprofilen synchronisiert. **Ungeprüfte Vorschläge bleiben im Ergebnistext orange sichtbar.** Beim Kopieren erscheint einmalig je Analyse eine deutliche Warnung mit den Optionen „Vorschläge prüfen“ und „Trotzdem kopieren“. Auf Mobilgeräten öffnet Antippen eines Begriffs ein Bearbeitungsmenü von unten, am Desktop zeigt Mouseover den Status und die Kategorie.

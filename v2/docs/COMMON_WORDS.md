# Warum kein Wörterbuch „ohne Ortsnamen“ erforderlich ist

Anonymat V2 verwendet einen **Kontrast zweier Datentypen**, keine behauptete Liste ausschließlich nicht-geografischer Wörter.

1. **Ortsnamen**: GeoNames `cities500`, inklusive Hauptnamen und ASCII-Schreibungen (CC BY 4.0).
2. **Gewöhnliche Wörter**: Die POS-annotierten deutschen Texte aus **Universal Dependencies German-GSD**, `train`, `dev`, `test` (CC BY-SA 4.0). Der Generator extrahiert belegte Wortformen mit Wortart `NOUN`, `VERB`, `AUX`, `ADJ`, `ADV` und Funktionswortklassen. Tokens mit `PROPN` (Eigennamen) werden nicht als gewöhnliche Wörter übernommen; `NamedEntity=Yes` wird ausgeschlossen.
3. **Schnittmenge**: `de-common-city-collisions.json` enthält **ausschließlich** Ortsnamen, die im Korpus unabhängig davon als normales Wort belegt sind. Beispiel: „Essen“, „Halle“, „Waren“. Mit dieser automatischen Liste entfällt das manuelle Festlegen einer kleinen Menge mehrdeutiger Städte.
4. **Erkennungsregeln**: Bei einem Ortsnamen aus der Schnittmenge ist ein expliziter Ortskontext erforderlich. Bei den verbleibenden Ortsnamen reicht für isolierte Wörter ohne Kontext **nicht** die Abwesenheit im Wörterbuch, sondern es muss eine populationsbasierte Prominenz vorliegen (GeoNames-Einwohnerzahl mindestens 50.000). Andere Einzelnamen benötigen ebenfalls Ortskontext. Mehrgliedrige Ortsnamen werden als eigener Kontextindikator behandelt.

**Wesentliche Einschränkung:** Die Abwesenheit eines Ortsnamens im gewöhnlichen Korpus beweist *nicht*, dass das Wort ausschließlich ein Eigenname ist. Der POS-Datensatz ist endlich, Fehler in der Annotation und seltene Flexionsformen bleiben möglich. Die Regel ist konservativ und kann echte Ortsnamen übersehen. Großschreibung, regionale Namen, Berufsbegriffe und Familiennamen können weiterhin zu Fehlalarmen führen. Die Regel ersetzt keine manuelle Sichtprüfung.

## Build und Herkunft

```sh
cd v2
python3 scripts/generate-city-lexicon.py
python3 scripts/generate-ambiguity-lexicon.py
npm run verify
```

Bei diesen beiden **Build-Schritten** werden die öffentlichen Datensätze abgerufen. Der fertige HTML-Client arbeitet rein offline und fragt keine Orts-/Wortliste im Netzwerk ab. Im Repository liegen kleinere Startdatensätze, sodass lokale Entwicklung ohne Download möglich bleibt. Im CI sowie bei Pages wird die vollständige Fassung gebaut.

**Quellen und Lizenzen:**

- [GeoNames](https://www.geonames.org/) – [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/), `https://download.geonames.org/export/dump/cities500.zip`
- [Universal Dependencies – German GSD](https://universaldependencies.org/treebanks/de_gsd/index.html), [Datensatz](https://github.com/UniversalDependencies/UD_German-GSD), [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Die aus diesem Datensatz abgeleitete POS-Schnittmenge wird unter den Bedingungen von CC BY-SA 4.0 bereitgestellt. Ursprungsarbeit: Petrov, Seeker, McDonald, Nivre, Zeman, Boyd und weitere UD-GSD-Mitwirkende.

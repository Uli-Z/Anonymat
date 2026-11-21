# European place-name lexicon

The checked-in file v2/src/data/europe-cities.json is a compact, offline **seed** (307 names)
so local builds and tests work without network access. Production builds regenerate
the same file **at build time** from GeoNames using:

    cd v2
    python3 scripts/generate-city-lexicon.py
    npm run verify

Source: GeoNames (https://www.geonames.org/) **Creative Commons Attribution 4.0**
(https://creativecommons.org/licenses/by/4.0/), official dataset
https://download.geonames.org/export/dump/cities500.zip.
GeoNames contains named settlements with population above 500 or qualifying
administrative seats. It does **not** literally list every hamlet in Europe.
The definition includes some transcontinental states; Russia is restricted
approximately west of longitude 60°E. Name alternatives are deliberately
limited to the principal/native and ASCII forms to reduce false positives.

The generated list is **embedded in the offline HTML file**. No place names,
typed text, or other content are sent to GeoNames or elsewhere at runtime.
To reduce false positives, nonmajor dictionary names are detected only with
geographic context, such as "aus Bremen", "in Paris" or "PLZ 28203 Bremen".
Every proposed match can be overridden or excluded in the editor. Detection
is not a guarantee of de-identification.

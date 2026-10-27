# Stakeout Assistant

A static JavaScript tool for preparing total-station stakeout from Cartesian ground coordinates. Import CSV points, choose station/orientation/target, and calculate relative direction, zenith and slope distance using the original interface.

This branch implements **phases 1–3**: a shared project model, a numerical engine independent of the DOM, atomic CSV/LandXML 1.1 import, polar survey reduction across dependent stations and a fieldbook stored as numerical records. WGS84 georeferencing and OGC WMS overlays remain later phases.

## Run the prototype

No runtime dependencies or backend are required.

For the editable source, use Node.js 22 or newer:

```sh
npm run dev
```

Open the printed local URL, normally `http://127.0.0.1:8766/`. The source uses ES modules and should be served over HTTP rather than opened directly with `file://`.

To produce an offline file:

```sh
npm run build
```

Open `dist/stakeout-assistant.html` directly in a modern browser. The build embeds the JavaScript modules, original stylesheet, logo and original flowchart into one HTML file. Node.js is required only for development, tests and packaging; the resulting file runs without it or an Internet connection.

The original interface, typography, colours, logo and flowchart are preserved. It opens with empty input, as before. LandXML uses the file picker, textarea, Load Points button and warning box; a reduced-observation table appears after import. The file picker displays explicit English labels regardless of the browser language. The native file selection dialog follows the operating system language. Synthetic points are available in the CSV fixture below.

## Input and coordinate conventions

Paste or open a `.csv` / `.txt` file:

```csv
Name,X,Y,Z,h
ST1,1000.000,2000.000,100.000,1.600
OR1,1000.000,2050.000,100.000,1.600
P1,1035.000,2045.000,101.200,1.800
```

- X is East, Y is North and Z is ground elevation, in metres. This phase preserves the existing axis convention.
- A header is optional. Four columns are sufficient; the fifth column `h` is optional and defaults to zero.
- Use commas between fields and a decimal point in numbers. Quoted CSV names, escaped quotes, BOM, CRLF and scientific notation are supported.
- Point names must be nonempty and unique. Coordinates must be finite; default heights must be finite and nonnegative.
- `h` supplies the instrument height when the point is selected as station and the target height when selected as target, preserving the existing CSV workflow. Internally these are separate setup/shot values, and the numerical API accepts independent heights for each calculation. Ground coordinates and earlier shots are not altered. Separate on-page height controls are not introduced in this phase.
- The input limit is 10 MB. Invalid rows produce line-numbered errors. Import is all-or-nothing: a failed import preserves the active points and fieldbook.
- The unified importer detects XML by content or file extension and routes it to the LandXML parser, never through the CSV parser.

A reusable synthetic file is available in [tests/fixtures/example.csv](tests/fixtures/example.csv).

## Prepare a fieldbook

1. Paste CSV or LandXML 1.1 and press **Load Points**, or upload a CSV/TXT/XML/LandXML file with the existing file input.
2. Select **Station Point**, **Orientation Point** and **Target Point**. The orientation defines the zero of the relative horizontal direction.
3. The CSV `h` values supply the station instrument height and target prism height, as in the existing interface.
4. Press **Calculate and add row to Fieldbook**.
5. Repeat for other targets. Remove a fieldbook row with its **-** button.
6. Use **Download Field-book CSV** before closing the page.

Angles are displayed in gon, clockwise from North; zenith is 100 gon at the horizon. The fieldbook stores the slope distance from instrument to reflector. Instrument height is added to station ground Z and target height to target ground Z.

Sea-level horizontal distance remains a separate comparison, preserving the original calculation:

```text
H0 = H × R / (R + mean ground elevation)
```

Changing the radius changes that displayed reduction, not the Cartesian coordinates or the slope distance stored in the fieldbook. The original default radius is 6,371 km. A user-selectable correction mode is planned separately.

Coincident station/orientation or station/target positions in plan are rejected because the horizontal direction is undefined. Other invalid configuration values do not add a fieldbook row.

## Revisions and precision

A successful CSV import increments the source revision. Existing fieldbook entries retain snapshots of the coordinates, instrument/target heights and results used for their calculation. Following a new import, the target names of historical rows are marked with `*` and their tooltips identify the previous revision; they are not silently recalculated against the new points. The existing warning box explains that marker.

All calculations and CSV exports use the numerical model at full JavaScript precision. Three-decimal distances and four-decimal angles are display formatting only. Export preserves the original first six columns:

```text
Station,Point,Azimuth,Zenith,Distance,Target Height
```

It appends instrument height, orientation, source revision and status. Azimuth and zenith are in gon, distance and heights in metres. CSV quoting handles names containing commas/quotes, and formula-like point identifiers are protected when exported to spreadsheets.

This phase keeps the project in memory. Refreshing or closing the page discards it; browser persistence and a reopenable project format are scheduled for a later phase.

## Code and tests

```text
stakeout-assistant.js       DOM events and presentation
src/model.mjs              SurveyProject, source revisions, setup/fieldbook operations
src/core/units.mjs          radians, gon, angle normalization and distance units
src/core/polar.mjs          pure azimuth, polar and distance-reduction functions
src/core/survey-reduction.mjs raw survey observations, setup resolution and computed local coordinates
src/io/csv.mjs              atomic CSV parsing and model-based fieldbook export
src/io/landxml11.mjs        LandXML 1.1 / Leica parser and source metadata
scripts/build.mjs          dependency-free standalone HTML packaging
scripts/serve.mjs          local source preview
```

`SurveyProject` distinguishes source points, per-point configuration defaults, setups, raw observations and computed stakeout records. A predicted stakeout is not stored as a measured raw observation. The data structure reserves later-phase fields without presenting those features as implemented.

Run:

```sh
npm ci --ignore-scripts
npm test
npm run build
```

The automated tests cover CSV and LandXML validation, atomic failure, independent heights, immutable fieldbook snapshots, numerical edge cases, units, cardinal directions, full-precision exports and synthetic two/three-station reductions. Five regression fixtures capture the numerical outputs of the upstream implementation at commit `20d7fda8a8aa2b04fe65d8d0744668e92d745347`, using synthetic coordinates; they verify compatibility of angles, distances and the sea-level comparison.

GitHub Actions installs development dependencies from the lockfile and runs tests/build on Node.js 22 and 24. The browser uses its native DOMParser; @xmldom/xmldom 0.9.12 is used only by Node tests and is not included in the offline HTML.

## LandXML 1.1 / Leica import

Upload a `.xml` / `.landxml` file or paste its contents into the existing textarea. The parser requires LandXML 1.1 and its official namespace. It reads 3D `CgPoints`, `InstrumentSetup` / `InstrumentPoint`, `RawObservation` / `TargetPoint`, `Backsight`, `TargetSetup`, observations in external `ObservationGroup` elements, equipment attributes and correction properties. Concatenated Leica XML documents are parsed independently, with or without DOS EOF (`0x1A`) and BOM separators, then coherent point catalogs are combined. Standalone dot lines and recognized misencoded BOMs (`Ôªø` or `ï»¿`) outside the XML documents are accepted with explicit warnings. XML content is never recoded or repaired, and the original source text is retained.

Input coordinates are North, East, Elevation and are normalised to internal E/N/Z metres. Raw angle values are normalised to radians, while original attributes, units and complete source XML are preserved. Supported angle encodings are grads, decimal degrees, radians and dd.mm.ss; supported lengths are metres, millimetres, centimetres, kilometres, feet and US survey feet. Explicit `directionUnit` takes precedence; when absent, the Leica application profile uses `angularUnit` and records that assumption, while other exports default to radians for directions.

The points table and existing Cartesian stakeout use **coordinates already exported in the file**. Raw observations, instrument/target heights, circle readings, face information and correction references are also preserved for survey reduction. Point-only files can feed stakeout; raw-only files are retained without inventing Cartesian positions. Direction-only targets are preserved as references and are not turned into zero-distance points.

A station uses its instrument-height default; a detail uses its target-height default. These remain separate internally. When repeated occupations/observations give multiple heights for one role, the importer reports the ambiguity, the table displays `varies` for that default and stakeout requiring that ambiguous role is blocked. Raw values remain available to the reduction workflow, where each observation retains its own setup and instrument/target heights.

The existing warning box reports document/point/setup/observation counts and import diagnostics. Malformed XML, wrong versions/namespaces, conflicting catalog coordinates, unknown setup/equipment references and unsupported offsets fail atomically. DTDs and external entities are rejected. Other unsupported geometric sections are retained in the source XML and explicitly reported. No schema or external resource is downloaded during parsing. Files up to 10 MB are accepted. This is a documented LandXML subset, not a complete XSD validator.

Use [tests/fixtures/leica-minimal.land.xml](tests/fixtures/leica-minimal.land.xml) for a synthetic sample. The real Pisano sample was checked locally: two concatenated documents, 27 exported points, one station and 27 raw observations, including one direction-only record. Its private coordinates are not included in repository fixtures.

LandXML tests additionally cover namespaces, unit conversion, separate heights, document boundaries, reference resolution, face II preservation, malformed inputs, atomic failure and survey metadata surviving fieldbook-row removal. Browser QA covers the real sample, failed reimport preserving the loaded points/fieldbook and unchanged table structure.

## Polar survey reduction

Successful LandXML import immediately reduces raw observations to local E/N/Z coordinates and displays every observation in the **Reduced Survey Observations** table. Each setup is resolved from its exported station coordinates or from a previously computed traverse point, so setup records may be out of order. Orientation is determined from known-coordinate backsights, repeated exported-coordinate direction checks, or LandXML setup orientation/circle metadata. An observation with an absolute azimuth can be reduced without an orientation offset. The Leica TS02 profile interprets `horizAngle` as clockwise from North, as verified against the exported Pisano coordinates; generic LandXML `horizAngle` follows the schema convention of counterclockwise from East. LandXML direction-valued `azimuth` is converted from counterclockwise-from-North to the application's clockwise-from-North convention.

For slope distance `S` and zenith angle `z`, horizontal distance is `S sin(z)` and vertical difference is `S cos(z)`. Instrument height is added to station elevation and target height is subtracted from the measured reflector elevation. Face II horizontal readings receive a half-turn and face II zenith readings are reflected once before reduction. Source coordinates remain unchanged. Repeated observations and checks remain separate; the calculated point list uses a single shot only when repeated coordinates agree within the configured tolerance, and reports closure residuals without averaging or adjusting the network.

The local vertical curvature/refraction correction uses `(1 - k) H² / (2R)`, with a 6,371,000 m radius and refraction coefficient `k = 0.13` as defaults. Source correction properties can override those parameters. When an observation references a Leica `TPSCorrectionRef`, curvature/refraction is not applied a second time. Atmospheric ppm and prism constants are retained as source metadata and never reapplied. The effective assumptions and per-shot correction status are shown in the interface. Unresolved stations, unsupported direction/distance combinations and inconsistent repeated shots remain visible as diagnostics.

## Project

All repository-authored text is written in English, including interface messages, code comments, documentation, tests, commit messages, issues and pull requests. Imported survey data and user-supplied names retain their original content.

Original project and source: [gianfrancodp/stakeout-assistant](https://github.com/gianfrancodp/stakeout-assistant).

The existing logo and original design assets are preserved. See [LICENSE](LICENSE) for the GNU GPL version 3 text.

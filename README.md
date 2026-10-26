# Stakeout Assistant

A static JavaScript tool for preparing total-station stakeout from Cartesian ground coordinates. Import CSV points, choose station/orientation/target, and calculate relative direction, zenith and slope distance using the original interface.

This branch implements **phase 1** of the upgrade: a shared project model, a numerical engine independent of the DOM, validated CSV import and a fieldbook stored as numerical records. LandXML 1.1 import, survey-network reduction, WGS84 georeferencing and OGC WMS overlays belong to the following phases.

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

The original English interface, section order, typography, colours, tables, logo and flowchart are preserved. It opens with empty input, as before. The only HTML changes connect the existing buttons to module event handlers; no new visible controls are introduced. Synthetic points are available in the CSV fixture below.

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
- XML is explicitly rejected in phase 1, without attempting to interpret it as CSV.

A reusable synthetic file is available in [tests/fixtures/example.csv](tests/fixtures/example.csv).

## Prepare a fieldbook

1. Paste CSV points and press **Load Points**, or upload a CSV/TXT file with the existing file input.
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
src/io/csv.mjs              atomic point parsing and model-based fieldbook export
scripts/build.mjs          dependency-free standalone HTML packaging
scripts/serve.mjs          local source preview
```

`SurveyProject` distinguishes source points, per-point configuration defaults, setups, raw observations and computed stakeout records. A predicted stakeout is not stored as a measured raw observation. The data structure reserves later-phase fields without presenting those features as implemented.

Run:

```sh
npm test
npm run build
```

The 49 automated tests cover CSV validation/quoting, atomic failure, independent heights, immutable fieldbook snapshots, source revisions, numerical edge cases, units, cardinal directions and full-precision exports. Five regression fixtures capture the numerical outputs of the upstream implementation at commit `20d7fda8a8aa2b04fe65d8d0744668e92d745347`, using synthetic coordinates; they verify compatibility of angles, distances and the sea-level comparison.

GitHub Actions runs the tests and standalone build on Node.js 22 and 24. No package installation step is needed because this phase has no dependencies.

## Project

Original project and source: [gianfrancodp/stakeout-assistant](https://github.com/gianfrancodp/stakeout-assistant).

The existing logo and original design assets are preserved. See [LICENSE](LICENSE) for the GNU GPL version 3 text.

# WA critical infrastructure map

[![Tests](https://github.com/Kalimaha/wa-critical-infrastructure-map/actions/workflows/pull-request-tests.yml/badge.svg?event=pull_request)](https://github.com/Kalimaha/wa-critical-infrastructure-map/actions/workflows/pull-request-tests.yml)

An interactive web map of Western Australia's critical infrastructure. It is a study case, currently showing the state road network, local government (LGA) boundaries, police facilities, and an H3 grid of estimated police response times.

<<<<<<< HEAD
The map is a React + Vite + MapLibre GL app. Vector tiles are served as [PMTiles](https://docs.protomaps.com/pmtiles/) from S3. Data processing lives in Jupyter notebooks and a `uv`-managed Python environment.

Live demo: [https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/dist/index.html](https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/dist/index.html)

Related notes:

- [Documents](./docs/README.md)
- [Notebooks](./notebooks/README.md)

## Run locally

The frontend loads tiles from S3. You do not need local GeoJSON or PMTiles files to view the map.

Requirements: Node.js 22 (the version used in CI).

```bash
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173`. In development it proxies `/pmtiles` to the S3 bucket so MapLibre can make HTTP range requests without CORS issues. Production builds (`npm run build`) use relative asset URLs (`base: './'`) and fetch tiles directly from S3, which is how the demo is hosted.

Useful frontend commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with the PMTiles proxy |
| `npm run build` | Typecheck, then write `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint with `--max-warnings 0` |
| `npm run storybook` | Storybook on port 6006 |

## Tests

Unit tests run in jsdom. Storybook tests run in headless Chromium via Playwright.

```bash
npm test
npx playwright install --with-deps chromium
npm run test-storybook
```

`npm test` is `vitest run --project=unit` and covers `src/**/*.test.ts`. `npm run test-storybook` is `vitest run --project=storybook` and exercises stories under `src/**/*.stories.@(ts|tsx)`.

Pull requests to `main` run both jobs in [`.github/workflows/pull-request-tests.yml`](.github/workflows/pull-request-tests.yml). Storybook CI installs Playwright Chromium first, the same as the local Storybook command above.

Some unit tests parse notebooks as raw JSON (for example `src/features/map/pmtilesConversion.test.ts`) so the `tippecanoe` flags and kept attributes stay in sync with what the map reads.

## Tooling

### Vite

Vite is the app bundler and dev server (`vite.config.ts`). Notable behaviour:

- React plugin, `base: './'` for static S3 hosting, output in `dist/`
- Custom middleware at `/pmtiles` that proxies to `https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com`
- `maplibre-gl` is excluded from `optimizeDeps` because of its worker entry

The map switches tile URLs with `import.meta.env.DEV`: `/pmtiles/...` in development, the S3 origin in production. Tile files currently expected on the bucket:

- `Road_network.pmtiles`
- `LGA_Boundaries.pmtiles`
- `Police_Facilities.pmtiles`
- `Police_Response_Coverage_m6.pmtiles`

### uv and Python

Python is for notebooks and tile generation, not the web UI. The project requires Python 3.14 (see `.python-version` and `requires-python` in `pyproject.toml`).

```bash
uv sync
uv run python -m jupyter notebook
```

`uv sync` installs DuckDB, GeoPandas, H3, PyArrow, the Python `pmtiles` package, and Jupyter (`ipykernel`). The `src/wa_critical_infrastructure_map` package is a stub so `uv` can resolve the project; the real processing is in notebooks.

[tippecanoe](https://github.com/felt/tippecanoe) is a separate system binary. Notebooks that write PMTiles fail if it is not on `PATH`.

### Data layout

| Path | Role |
| --- | --- |
| `data/raw/` | Source GeoJSON / shapefiles from [Data WA](https://data.wa.gov.au/). Gitignored; see [`data/raw/README.md`](data/raw/README.md). |
| `data/processed/` | Generated GeoJSON and PMTiles. Gitignored. |
| `notebooks/02-geojson-to-pmtiles.ipynb` | Convert roads, LGA boundaries, and police facilities to PMTiles. |
| `notebooks/03-h3-police-response-coverage.ipynb` | Build the H3 response-coverage grid and export PMTiles. |

Road source data does not include travel speeds. The coverage notebook uses a configurable speed profile; treat those times as a study estimate, not an operational SLA.

### Response coverage (WIP) — known limitations

- **Red** means travel time **>15 min** **or** unreachable on the modelled network.
- Cells can be orange/red even when no road sits inside the hex: travel time is computed via nearest-road snap to the cell centroid.
- Dense roads far from stations stay red when modelled travel still exceeds 15 minutes.
- LGA polyfill paints land broadly, including areas where the Main Roads network is sparse.

## Map app (for humans and agents)

Entry: `src/main.tsx` → `src/features/map/MapApp.tsx` → `usePmtilesMap` + `MapView`.

Layer groups toggled in the UI (`MapLayerGroup`): `roads`, `boundaries`, `facilities`, `responseCoverage`.

| Concern | Where |
| --- | --- |
| Map init, PMTiles protocol, layer paint, visibility | `src/features/map/usePmtilesMap.ts` |
| Chrome: header, legend, layer toggles, status | `src/features/map/MapView.tsx` |
| Police points: decode PMTiles, cluster on a GeoJSON source | `src/features/map/policeFacilities.ts` |
| Click hit-testing and popups | `src/features/map/featureHitTest.ts`, `featurePopup.ts` |
| Attribute names the tiles must keep | `src/features/map/roadAttributes.ts` |
| Global styles | `src/styles/global.css` |

Police facilities are loaded from PMTiles into a clustered GeoJSON source rather than rendered as a vector tile layer. Roads, LGA boundaries, and response coverage stay as vector PMTiles sources.

If you change which GeoJSON properties are written into tiles, update the matching `tippecanoe` `-y` flags in the notebooks. The unit tests will fail if those attributes drift from `roadAttributes.ts`.
=======
* [Documents](./docs/README.md)
* [Notebooks](./notebooks/README.md) — including the canonical [H3 police response coverage](./notebooks/03-h3-police-response-coverage.ipynb) notebook (dense H3 res-7 polyfill; see notebooks README)
>>>>>>> origin/emergency-coverage

# Notebooks

* [01 - First notebook](./01-first-notebook.ipynb)
* [02 - GeoJSON to PMTiles](./02-geojson-to-pmtiles.ipynb)
* [03 - H3 Police Response Coverage](./03-h3-police-response-coverage.ipynb) — **canonical** H3 response-coverage pipeline, implemented in `src/wa_critical_infrastructure_map/response_coverage.py` with DuckDB SQL for joins and aggregation: dense `h3.polygon_to_cells` at resolution 7, cell→road snap to nearest **station-reachable** segment within 5 km (orphaned components ignored), Dijkstra response times (`unreachable` when no station / no snap; red = reachable >15 min only), a FlatGeobuf export written by DuckDB, and tippecanoe `-Z0 -z12` with `--no-tiny-polygon-reduction` / `--drop-rate=0`.

## Retired

* `Hexagons.ipynb` — near-duplicate of notebook 03 that dropped unreachable cells instead of retaining them. Do not use; deleted in favour of notebook 03.

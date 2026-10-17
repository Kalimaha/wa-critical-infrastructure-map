"""H3 response-coverage pipeline: road-network travel times from facilities to every H3 cell.

Spatial joins, lookups, and aggregations run as SQL in DuckDB; graph traversal runs in
scipy's compiled sparse-graph routines. Every step writes a table to the working database
so a run can be explored with plain SQL afterwards.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import duckdb
import h3
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import shapely
from h3 import LatLngPoly
from scipy.sparse import coo_matrix, csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from shapely.geometry import Polygon

# Review these values before using the output operationally. The default profile
# is an illustrative estimate, not a measured policing response-time model.
DEFAULT_ROAD_SPEED_KMH: dict[str, float] = {
    "State Road": 80.0,
    "Main Roads Controlled Path": 80.0,
    "Local Road": 50.0,
    "Miscellaneous Road": 40.0,
    "Proposed Road": 30.0,
    "Crossover": 60.0,
    "Unknown": 40.0,
}

RESPONSE_CLASSIFICATIONS = [
    {"label": "green", "min": 0.0, "max": 5.0, "color": "#2E7D32"},
    {"label": "yellow", "min": 5.0, "max": 10.0, "color": "#F9A825"},
    {"label": "orange", "min": 10.0, "max": 15.0, "color": "#EF6C00"},
    {"label": "red", "min": 15.0, "max": float("inf"), "color": "#C62828"},
]

COVERAGE_PROPERTIES = [
    "h3_cell",
    "h3_resolution",
    "response_class",
    "min_response_minutes",
    "mean_response_minutes",
    "reachable_stations",
    "road_segment_count",
    "source_layer",
]


@dataclass(frozen=True)
class CoverageConfig:
    """Inputs, outputs, and model parameters for one coverage run.

    Each input uses a different CRS, so ST_Transform is given the source CRS
    explicitly. Distances and lengths are measured in ``projected_crs`` metres.
    ``station_types`` keeps only those values of ``station_type_column``; leave
    it unset to include every point feature.
    """

    road_path: Path
    station_path: Path
    boundary_path: Path
    output_dir: Path
    layer_name: str = "Police_Response_Coverage"
    cache_dir: Path | None = None
    road_crs: str = "EPSG:4326"
    station_crs: str = "EPSG:4283"
    boundary_crs: str = "EPSG:7844"
    projected_crs: str = "EPSG:28350"
    h3_resolution: int = 7
    max_snap_metres: float = 5000.0
    max_response_minutes: float = 15.0
    road_speed_kmh: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_ROAD_SPEED_KMH))
    station_name_column: str = "NAME"
    station_type_column: str | None = None
    station_types: tuple[str, ...] | None = None
    station_description: str = "police station"

    @classmethod
    def for_repository(cls, repository_root: Path) -> CoverageConfig:
        raw_dir = repository_root / "data" / "raw"
        processed_dir = repository_root / "data" / "processed"
        return cls(
            road_path=raw_dir / "Road_Network.geojson",
            station_path=raw_dir / "WAPoliceForceFacilities_SHP" / "Police_Facilities.shp",
            boundary_path=raw_dir / "LGA_Boundaries_LGATE_233_WA_GDA2020_Public.geojson",
            output_dir=processed_dir,
            cache_dir=processed_dir / "cache",
        )

    @classmethod
    def for_dfes(cls, repository_root: Path) -> CoverageConfig:
        """Fire-station coverage on the same roads and LGA boundaries as the police run."""
        return replace(
            cls.for_repository(repository_root),
            station_path=(
                repository_root / "data" / "raw" / "DFES_Stations_DFES_023_WA_GDA2020_Public.geojson"
            ),
            station_crs="EPSG:7844",
            layer_name="DFES_Response_Coverage",
            station_name_column="displaynam",
            station_type_column="type",
            station_types=("BFB", "VFRS", "VFESU", "CFRS", "PFRS"),
            station_description="DFES fire station",
        )

    @property
    def database_path(self) -> Path:
        return self.output_dir / f"{self.layer_name}.duckdb"


def connect(config: CoverageConfig, fresh: bool = True) -> duckdb.DuckDBPyConnection:
    """Open the working database, deleting any previous run when ``fresh``.

    Replacing tables in place does not shrink the file, so full runs start from scratch.
    """
    config.output_dir.mkdir(parents=True, exist_ok=True)
    if fresh:
        for suffix in ("", ".wal"):
            Path(f"{config.database_path}{suffix}").unlink(missing_ok=True)
    con = duckdb.connect(config.database_path)
    con.install_extension("spatial")
    con.load_extension("spatial")
    con.execute("SET VARIABLE max_snap_metres = ?", [config.max_snap_metres])
    return con


def _source_digest(path: Path, extra: str = "") -> str:
    """Hash of a layer's contents, including shapefile sidecars such as ``.dbf``."""
    digest = hashlib.sha256()
    for member in sorted(path.parent.glob(f"{path.stem}.*")):
        if member.suffix.lower() in (".pdf", ".xml"):
            continue
        digest.update(member.name.encode())
        with member.open("rb") as source_file:
            for chunk in iter(lambda: source_file.read(1 << 20), b""):
                digest.update(chunk)
    digest.update(extra.encode())
    return digest.hexdigest()[:16]


def source_relation(con: duckdb.DuckDBPyConnection, config: CoverageConfig, path: Path) -> str:
    """SQL relation for a raw input layer, read via a GeoParquet copy when caching is on.

    GDAL parses GeoJSON slowly and in full on every read; the GeoParquet copy is
    written once per source version and keeps every column, the CRS, and row order.
    """
    if config.cache_dir is None:
        return f"ST_Read('{path}')"
    cache_path = config.cache_dir / f"source_{path.stem}_{_source_digest(path)}.parquet"
    if not cache_path.exists():
        config.cache_dir.mkdir(parents=True, exist_ok=True)
        for stale in config.cache_dir.glob(f"source_{path.stem}_*.parquet"):
            stale.unlink()
        partial = cache_path.with_suffix(".partial")
        con.execute(f"""
            COPY (SELECT * FROM ST_Read('{path}'))
            TO '{partial}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """)
        partial.rename(cache_path)
    return f"read_parquet('{cache_path}')"


def load_inputs(con: duckdb.DuckDBPyConnection, config: CoverageConfig) -> dict[str, int]:
    """Load, validate, and project roads, stations, and boundaries into DuckDB tables."""
    for path in (config.road_path, config.station_path, config.boundary_path):
        if not path.exists():
            raise FileNotFoundError(f"Required input layer not found: {path}")
    road_source = source_relation(con, config, config.road_path)
    station_source = source_relation(con, config, config.station_path)
    boundary_source = source_relation(con, config, config.boundary_path)

    unknown_speed = config.road_speed_kmh["Unknown"]
    con.execute(
        "CREATE OR REPLACE TABLE road_speeds (network_type VARCHAR PRIMARY KEY, speed_kmh DOUBLE)"
    )
    con.executemany("INSERT INTO road_speeds VALUES (?, ?)", list(config.road_speed_kmh.items()))

    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE raw_roads AS
        SELECT
            r.OGC_FID AS road_fid,
            r.START_NODE_NO AS start_node_no,
            r.END_NODE_NO AS end_node_no,
            coalesce(r.NETWORK_TYPE, 'Unknown') AS network_type,
            coalesce(speeds.speed_kmh, {unknown_speed}) AS speed_kmh,
            r.geom AS geom,
            ST_Transform(r.geom, '{config.road_crs}', '{config.projected_crs}', always_xy := true)
                AS projected_geom
        FROM {road_source} AS r
        LEFT JOIN road_speeds AS speeds ON speeds.network_type = coalesce(r.NETWORK_TYPE, 'Unknown')
    """)

    # segment_id is the 0-based position among valid roads, in source-file order.
    con.execute("""
        CREATE OR REPLACE TABLE roads AS
        SELECT
            row_number() OVER (ORDER BY road_fid) - 1 AS segment_id,
            *,
            ST_Length(projected_geom) / 1000.0 / speed_kmh * 60.0 AS weight_minutes
        FROM raw_roads
        WHERE start_node_no IS NOT NULL
          AND end_node_no IS NOT NULL
          AND ST_IsValid(geom)
          AND ST_Length(projected_geom) > 0
          AND speed_kmh > 0
    """)

    # Column names come from CoverageConfig, not from outside input.
    type_column = (
        f",\n            {config.station_type_column} AS station_type"
        if config.station_type_column is not None
        else ""
    )
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE raw_stations AS
        SELECT
            OGC_FID AS station_id,
            {config.station_name_column} AS name{type_column},
            geom,
            ST_Transform(geom, '{config.station_crs}', '{config.projected_crs}', always_xy := true)
                AS projected_geom
        FROM {station_source}
    """)
    if config.station_types is None:
        con.execute("""
            CREATE OR REPLACE TABLE stations AS
            SELECT * FROM raw_stations
            WHERE ST_IsValid(geom) AND ST_GeometryType(geom) = 'POINT'
        """)
    else:
        con.execute(
            """
            CREATE OR REPLACE TABLE stations AS
            SELECT * FROM raw_stations
            WHERE ST_IsValid(geom)
              AND ST_GeometryType(geom) = 'POINT'
              AND station_type IN (SELECT unnest(?))
            """,
            [list(config.station_types)],
        )

    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE raw_boundaries AS
        SELECT
            name,
            geom,
            ST_Transform(geom, '{config.boundary_crs}', '{config.projected_crs}', always_xy := true)
                AS projected_geom
        FROM {boundary_source}
    """)
    con.execute("""
        CREATE OR REPLACE TABLE boundaries AS
        SELECT * FROM raw_boundaries
        WHERE ST_IsValid(geom) AND ST_Area(projected_geom) > 0
    """)

    counts = dict(con.execute("""
        SELECT 'road_rows', count(*) FROM raw_roads
        UNION ALL SELECT 'valid_road_rows', count(*) FROM roads
        UNION ALL SELECT 'station_rows', count(*) FROM raw_stations
        UNION ALL SELECT 'valid_station_rows', count(*) FROM stations
        UNION ALL SELECT 'boundary_rows', count(*) FROM raw_boundaries
        UNION ALL SELECT 'valid_boundary_rows', count(*) FROM boundaries
    """).fetchall())
    if not (counts["valid_road_rows"] and counts["valid_station_rows"] and counts["valid_boundary_rows"]):
        raise ValueError("At least one valid road, station, and boundary feature are required.")
    return counts


def build_road_graph(con: duckdb.DuckDBPyConnection) -> csr_matrix:
    """Number road nodes in SQL, then build an undirected weighted sparse graph."""
    con.execute("""
        CREATE OR REPLACE TABLE road_nodes AS
        SELECT node_no, row_number() OVER (ORDER BY node_no) - 1 AS node_id
        FROM (
            SELECT start_node_no AS node_no FROM roads
            UNION
            SELECT end_node_no FROM roads
        )
    """)
    con.execute("""
        CREATE OR REPLACE TABLE segments AS
        SELECT r.segment_id, s.node_id AS start_id, e.node_id AS end_id,
               r.network_type, r.speed_kmh, r.weight_minutes, r.projected_geom
        FROM roads AS r
        JOIN road_nodes AS s ON s.node_no = r.start_node_no
        JOIN road_nodes AS e ON e.node_no = r.end_node_no
    """)

    # One edge per node pair with its fastest segment: building a CSR matrix from
    # duplicate COO entries would sum them. Self-loops never shorten a path.
    edges = con.execute("""
        SELECT least(start_id, end_id) AS a, greatest(start_id, end_id) AS b,
               min(weight_minutes) AS minutes
        FROM segments
        WHERE start_id <> end_id
        GROUP BY ALL
    """).fetchnumpy()
    node_count = con.execute("SELECT count(*) FROM road_nodes").fetchone()[0]
    weights = np.asarray(edges["minutes"], dtype=np.float64)
    if not (weights > 0).all():
        # csgraph treats zero-weight entries as missing edges.
        raise ValueError("Segment travel times must be strictly positive.")
    return coo_matrix(
        (weights, (np.asarray(edges["a"], np.int64), np.asarray(edges["b"], np.int64))),
        shape=(node_count, node_count),
    ).tocsr()


def create_station_sources(con: duckdb.DuckDBPyConnection) -> list[tuple[int, int, float, float]]:
    """Connect each station to the nearest road segment and its endpoints."""
    con.execute("""
        CREATE OR REPLACE TABLE station_sources AS
        WITH nearest_segment AS (
            SELECT st.station_id, st.projected_geom AS station_geom,
                   seg.start_id, seg.end_id, seg.speed_kmh, seg.projected_geom AS segment_geom
            FROM stations AS st
            JOIN segments AS seg
              ON ST_DWithin(st.projected_geom, seg.projected_geom, getvariable('max_snap_metres'))
            QUALIFY row_number() OVER (
                PARTITION BY st.station_id
                ORDER BY ST_Distance(st.projected_geom, seg.projected_geom), seg.segment_id
            ) = 1
        ),
        endpoints AS (
            SELECT station_id, start_id AS node_id, speed_kmh,
                   ST_Distance(station_geom, ST_StartPoint(segment_geom)) / 1000.0 AS distance_km
            FROM nearest_segment
            UNION ALL
            SELECT station_id, end_id, speed_kmh,
                   ST_Distance(station_geom, ST_EndPoint(segment_geom)) / 1000.0
            FROM nearest_segment
        )
        SELECT node_id, station_id,
               greatest(0.01, distance_km / speed_kmh * 60.0) AS access_minutes,
               distance_km
        FROM endpoints
        WHERE distance_km > 0 AND distance_km <= getvariable('max_snap_metres') / 1000.0
    """)
    return con.execute(
        "SELECT node_id, station_id, access_minutes, distance_km FROM station_sources "
        "ORDER BY station_id, node_id"
    ).fetchall()


def _ring_latlng(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """(lng, lat) ring → (lat, lng) for h3 LatLngPoly, dropping the closing vertex."""
    if coords and coords[0] == coords[-1]:
        coords = coords[:-1]
    return [(lat, lng) for lng, lat in coords]


def polygon_to_cells(poly: Polygon, resolution: int) -> set[str]:
    """Dense polyfill of a Shapely polygon (cell centres inside, holes excluded)."""
    exterior = _ring_latlng(list(poly.exterior.coords))
    if len(exterior) < 3:
        return set()
    holes = [ring for ring in (_ring_latlng(list(hole.coords)) for hole in poly.interiors) if len(ring) >= 3]
    return set(h3.polygon_to_cells(LatLngPoly(exterior, *holes), resolution))


def split_polygon(polygon: Polygon, max_vertices: int) -> list[Polygon]:
    """Quarter a polygon by its bounding box until every piece has at most ``max_vertices``.

    Polyfill cost grows with cells x vertices, so many small pieces are far faster than
    one 87k-vertex coastline. With centre containment, the pieces' cells together equal
    the whole polygon's cells.
    """
    stack, pieces = [polygon], []
    while stack:
        piece = stack.pop()
        if shapely.get_num_coordinates(piece) <= max_vertices:
            pieces.append(piece)
            continue
        min_x, min_y, max_x, max_y = piece.bounds
        mid_x, mid_y = (min_x + max_x) / 2, (min_y + max_y) / 2
        for box in (
            (min_x, min_y, mid_x, mid_y),
            (mid_x, min_y, max_x, mid_y),
            (min_x, mid_y, mid_x, max_y),
            (mid_x, mid_y, max_x, max_y),
        ):
            clipped = shapely.clip_by_rect(piece, *box)
            stack.extend(part for part in shapely.get_parts(clipped) if part.geom_type == "Polygon")
    return pieces


def polyfill_boundaries(
    con: duckdb.DuckDBPyConnection, resolution: int, max_vertices: int = 500
) -> list[str]:
    """Sorted H3 cells covering the union of the ``boundaries`` table."""
    rows = con.execute(
        "SELECT ST_AsWKB(unnest(ST_Dump(ST_Union_Agg(geom))).geom) FROM boundaries"
    ).fetchall()
    cells: set[str] = set()
    for part in shapely.from_wkb([bytes(row[0]) for row in rows]):
        if part.geom_type != "Polygon":
            continue
        for piece in split_polygon(part, max_vertices):
            cells.update(polygon_to_cells(piece, resolution))
    return sorted(cells)


def grid_cache_path(config: CoverageConfig) -> Path | None:
    """Cache file keyed on the boundary file contents, boundary CRS, and H3 resolution."""
    if config.cache_dir is None:
        return None
    digest = _source_digest(config.boundary_path, f"{config.boundary_crs}|{config.h3_resolution}")
    return config.cache_dir / f"h3_grid_r{config.h3_resolution}_{digest}.parquet"


def generate_full_grid(con: duckdb.DuckDBPyConnection, config: CoverageConfig) -> tuple[int, bool]:
    """Create ``h3_cells`` from the boundary polyfill, reusing the on-disk cache when possible.

    Returns the cell count and whether the cache was used.
    """
    cache_path = grid_cache_path(config)
    from_cache = cache_path is not None and cache_path.exists()
    if from_cache:
        full_grid = pq.read_table(cache_path).column("h3_cell").to_pylist()
    else:
        full_grid = polyfill_boundaries(con, config.h3_resolution)
        if cache_path is not None:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(pa.table({"h3_cell": full_grid}), cache_path)

    centroids = [h3.cell_to_latlng(cell) for cell in full_grid]
    grid = pa.table({
        "cell_id": list(range(len(full_grid))),
        "h3_cell": full_grid,
        "latitude": [latitude for latitude, _ in centroids],
        "longitude": [longitude for _, longitude in centroids],
    })
    con.execute(f"""
        CREATE OR REPLACE TABLE h3_cells AS
        SELECT cell_id, h3_cell,
               ST_Transform(ST_Point(longitude, latitude), 'EPSG:4326', '{config.projected_crs}',
                            always_xy := true) AS projected_centroid
        FROM grid
    """)
    return len(full_grid), from_cache


def nodes_reachable_from_stations(
    graph: csr_matrix,
    station_sources: list[tuple[int, int, float, float]],
) -> set[int]:
    """Nodes on any road component that contains a station→road source node."""
    _component_count, labels = connected_components(graph, directed=False)
    source_components = {labels[source[0]] for source in station_sources}
    return {int(node) for node in np.flatnonzero(np.isin(labels, list(source_components)))}


def assign_h3_cells(con: duckdb.DuckDBPyConnection, station_reachable_nodes: set[int]) -> int:
    """Snap each cell to the nearest station-reachable road segment; return the snapped count.

    Only segments whose endpoints are reachable from a station are considered. Centroids
    with no such segment within the snap cap get no ``cell_segments`` row (unreachable),
    so orphaned road components never produce false network times. Exact distance ties
    go to the lowest segment_id so runs are reproducible.
    """
    reachable = pa.table({"node_id": sorted(station_reachable_nodes)})
    con.execute("""
        CREATE OR REPLACE TABLE reachable_segments AS
        SELECT * FROM segments
        WHERE start_id IN (SELECT node_id FROM reachable)
           OR end_id IN (SELECT node_id FROM reachable)
    """)
    con.execute("""
        CREATE OR REPLACE TABLE cell_segments AS
        SELECT c.cell_id, seg.segment_id, seg.start_id, seg.end_id
        FROM h3_cells AS c
        JOIN reachable_segments AS seg
          ON ST_DWithin(c.projected_centroid, seg.projected_geom, getvariable('max_snap_metres'))
        QUALIFY row_number() OVER (
            PARTITION BY c.cell_id
            ORDER BY ST_Distance(c.projected_centroid, seg.projected_geom), seg.segment_id
        ) = 1
    """)
    return con.execute("SELECT count(*) FROM cell_segments").fetchone()[0]


def compute_cell_station_minutes(
    con: duckdb.DuckDBPyConnection,
    graph: csr_matrix,
    max_sources_per_chunk: int = 16,
) -> None:
    """Create ``cell_station_minutes``: per (cell, station), the fastest time to either
    endpoint of the cell's snapped segment. Pairs with no road path are omitted.

    Dijkstra runs for a chunk of source nodes at a time; the chunk size bounds memory
    (sources x nodes float64 matrix) at a small cost in speed.
    """
    con.execute("""
        CREATE OR REPLACE TABLE cell_endpoints AS
        SELECT cell_id, start_id AS node_id FROM cell_segments
        UNION
        SELECT cell_id, end_id FROM cell_segments
    """)
    con.execute(
        "CREATE OR REPLACE TABLE cell_station_minutes (cell_id BIGINT, station_id BIGINT, minutes DOUBLE)"
    )

    sources = con.execute(
        "SELECT station_id, node_id, access_minutes FROM station_sources ORDER BY station_id, node_id"
    ).fetchnumpy()
    source_station = np.asarray(sources["station_id"], np.int64)
    source_node = np.asarray(sources["node_id"], np.int64)
    source_access = np.asarray(sources["access_minutes"], np.float64)

    endpoints = con.execute(
        "SELECT cell_id, node_id FROM cell_endpoints ORDER BY cell_id, node_id"
    ).fetchnumpy()
    endpoint_cell = np.asarray(endpoints["cell_id"], np.int64)
    endpoint_node = np.asarray(endpoints["node_id"], np.int64)
    if len(source_station) == 0 or len(endpoint_node) == 0:
        return
    cell_starts = np.flatnonzero(np.r_[True, endpoint_cell[1:] != endpoint_cell[:-1]])
    cell_ids = endpoint_cell[cell_starts]

    # Chunk on station boundaries so all of a station's sources share one Dijkstra call.
    station_starts = np.flatnonzero(np.r_[True, source_station[1:] != source_station[:-1]])
    station_bounds = np.r_[station_starts, len(source_station)]
    station_count = len(station_starts)
    chunks: list[tuple[int, int]] = []
    first = 0
    for last in range(1, station_count + 1):
        if last == station_count or station_bounds[last + 1] - station_bounds[first] > max_sources_per_chunk:
            chunks.append((first, last))
            first = last

    for first, last in chunks:
        low, high = station_bounds[first], station_bounds[last]
        network = dijkstra(graph, directed=False, indices=source_node[low:high])
        at_endpoints = network[:, endpoint_node] + source_access[low:high, None]
        per_station = np.minimum.reduceat(at_endpoints, station_bounds[first:last] - low, axis=0)
        per_cell = np.minimum.reduceat(per_station, cell_starts, axis=1)

        station_index, cell_index = np.nonzero(np.isfinite(per_cell))
        chunk = pa.table({
            "cell_id": cell_ids[cell_index],
            "station_id": source_station[station_bounds[first:last]][station_index],
            "minutes": per_cell[station_index, cell_index],
        })
        con.execute("INSERT INTO cell_station_minutes SELECT * FROM chunk")


def build_coverage(con: duckdb.DuckDBPyConnection, config: CoverageConfig) -> None:
    """Create ``coverage``: one row per H3 cell with its response class and times.

    Every generated cell stays visible. No reachable station (including no snapped road
    within the snap cap) → dedicated unreachable class; red is only for reachable >15 min.
    """
    green, yellow, orange = (item["max"] for item in RESPONSE_CLASSIFICATIONS[:3])
    unreachable_minutes = config.max_response_minutes + 0.01
    con.execute(f"""
        CREATE OR REPLACE TABLE coverage AS
        WITH per_cell AS (
            SELECT cell_id,
                   min(minutes) AS min_minutes,
                   avg(minutes) AS mean_minutes,
                   count(*) AS reachable_stations
            FROM cell_station_minutes
            GROUP BY cell_id
        )
        SELECT
            c.h3_cell,
            {config.h3_resolution} AS h3_resolution,
            CASE
                WHEN p.cell_id IS NULL THEN 'unreachable'
                WHEN p.min_minutes < {green} THEN 'green'
                WHEN p.min_minutes < {yellow} THEN 'yellow'
                WHEN p.min_minutes < {orange} THEN 'orange'
                ELSE 'red'
            END AS response_class,
            round(coalesce(p.min_minutes, {unreachable_minutes}), 2) AS min_response_minutes,
            round(coalesce(p.mean_minutes, {unreachable_minutes}), 2) AS mean_response_minutes,
            coalesce(p.reachable_stations, 0) AS reachable_stations,
            CASE WHEN s.cell_id IS NULL THEN 0 ELSE 1 END AS road_segment_count,
            'Road_Network' AS source_layer
        FROM h3_cells AS c
        LEFT JOIN per_cell AS p USING (cell_id)
        LEFT JOIN cell_segments AS s USING (cell_id)
        ORDER BY c.h3_cell
    """)


def build_metadata(config: CoverageConfig) -> dict[str, Any]:
    return {
        "h3_resolution": config.h3_resolution,
        "maximum_sample_distance_metres": config.max_snap_metres,
        "maximum_response_minutes": config.max_response_minutes,
        "speed_profile_kmh": config.road_speed_kmh,
        **(
            {"station_types": list(config.station_types)}
            if config.station_types is not None
            else {}
        ),
        "classification_thresholds_minutes": {
            "green": "< 5",
            "yellow": "5-10",
            "orange": "10-15",
            "red": "> 15 (reachable only)",
            "unreachable": "no reachable station / no station-reachable road within snap cap",
        },
        "method": (
            f"Dense h3.polygon_to_cells polyfill of the WA LGA boundary union at resolution {config.h3_resolution}; "
            "cell→road snap to nearest station-reachable segment within maximum_sample_distance_metres; "
            f"shortest road-network travel time from each {config.station_description}; "
            "response class uses the fastest reachable station; "
            "unreachable when reachable_stations=0 (not painted red)."
        ),
        "station_to_road_method": "Nearest road segment, connected to both endpoints using the segment speed assumption.",
        "cell_to_road_method": (
            f"Nearest projected road segment on a station-reachable graph component "
            f"within {config.max_snap_metres:.0f} m of the cell centroid; "
            "orphaned components are ignored. Farther cells get an empty assignment "
            "and class unreachable. Exact distance ties go to the lowest segment_id. "
            "No last-mile off-network travel time is added."
        ),
        "h3_fill_method": (
            "h3.polygon_to_cells (LatLngPoly, cell centre inside) on the boundary union, split into "
            "tiles of at most 500 vertices -- not 0.1 deg lattice + grid_disk."
        ),
        "limitations": [
            "Road speed values are estimates because source data has no speed field.",
            "Station-to-road connection uses the nearest segment and an endpoint-based estimate.",
            "Cell→road snap prefers station-reachable segments within the cap; orphaned components and cells beyond the cap are unreachable.",
            "No last-mile centroid→road travel time is included for snapped cells.",
            "Cells with no reachable station use response_class=unreachable (map: dark grey); red is reachable >15 min only.",
        ],
    }


def build_cell_polygons(con: duckdb.DuckDBPyConnection) -> None:
    """Create ``cell_polygons(h3_cell, geom)``: each coverage cell's outline in lon/lat."""
    cells = [row[0] for row in con.execute("SELECT h3_cell FROM coverage").fetchall()]
    outlines = [
        shapely.Polygon([(longitude, latitude) for latitude, longitude in h3.cell_to_boundary(cell)])
        for cell in cells
    ]
    polygons = pa.table({"h3_cell": cells, "wkb": shapely.to_wkb(outlines)})
    con.execute("""
        CREATE OR REPLACE TABLE cell_polygons AS
        SELECT h3_cell, ST_GeomFromWKB(wkb) AS geom FROM polygons
    """)


def export_coverage(con: duckdb.DuckDBPyConnection, config: CoverageConfig) -> dict[str, Path]:
    """Write the coverage FlatGeobuf, metadata, and PMTiles (via tippecanoe)."""
    if shutil.which("tippecanoe") is None:
        raise RuntimeError(
            "tippecanoe is not installed. Install it with your system package manager or ensure it is on PATH."
        )
    flatgeobuf_path = config.output_dir / f"{config.layer_name}.fgb"
    pmtiles_path = config.output_dir / f"{config.layer_name}.pmtiles"
    metadata_path = config.output_dir / f"{config.layer_name}_metadata.json"

    build_cell_polygons(con)
    # Integer columns are written as doubles so the tiles encode them exactly as the
    # earlier GeoJSON-based export did. tippecanoe reads the file sequentially, so a
    # FlatGeobuf spatial index would only add size.
    columns = ", ".join(
        f"c.{name}::DOUBLE AS {name}"
        if name in ("h3_resolution", "reachable_stations", "road_segment_count")
        else f"c.{name}"
        for name in COVERAGE_PROPERTIES
    )
    flatgeobuf_path.unlink(missing_ok=True)
    con.execute(f"""
        COPY (
            SELECT {columns}, p.geom
            FROM coverage AS c JOIN cell_polygons AS p USING (h3_cell)
            ORDER BY c.h3_cell
        ) TO '{flatgeobuf_path}' WITH (
            FORMAT GDAL, DRIVER 'FlatGeobuf', SRS 'EPSG:4326',
            LAYER_NAME '{config.layer_name}', LAYER_CREATION_OPTIONS 'SPATIAL_INDEX=NO'
        )
    """)
    metadata_path.write_text(json.dumps(build_metadata(config), indent=2), encoding="utf-8")

    # Keep every hex through city zoom (no tiny-polygon attrition).
    command = [
        "tippecanoe",
        "-o", str(pmtiles_path),
        "-Z", "0",
        "-z", "12",
        "--force",
        "--no-tile-size-limit",
        "--no-feature-limit",
        "--no-tiny-polygon-reduction",
        "--no-tiny-polygon-reduction-at-maximum-zoom",
        "--drop-rate=0",
        "--detect-shared-borders",
        "-l", config.layer_name,
        "-n", config.layer_name,
        "-N", "H3 response-coverage grid for Western Australia",
        *[argument for name in COVERAGE_PROPERTIES for argument in ("-y", name)],
        str(flatgeobuf_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Tippecanoe failed:\n{completed.stdout}\n{completed.stderr}")
    return {"flatgeobuf": flatgeobuf_path, "metadata": metadata_path, "pmtiles": pmtiles_path}


def run(config: CoverageConfig, export: bool = True) -> duckdb.DuckDBPyConnection:
    """Run the whole pipeline and return the open working-database connection."""
    con = connect(config)
    load_inputs(con, config)
    graph = build_road_graph(con)
    station_sources = create_station_sources(con)
    reachable = nodes_reachable_from_stations(graph, station_sources)
    generate_full_grid(con, config)
    assign_h3_cells(con, reachable)
    compute_cell_station_minutes(con, graph)
    build_coverage(con, config)
    if export:
        export_coverage(con, config)
    return con

from __future__ import annotations

import dataclasses
import json
import shutil
from pathlib import Path

import h3
import pytest
import shapely

from wa_critical_infrastructure_map import response_coverage as rc

RESOLUTION = 7
ROAD_LATITUDE = -31.96
# Main road nodes, west to east. Node 2 sits exactly on an H3 cell centre so the two
# segments that meet there are equidistant from that cell (a deliberate tie).
TIE_CELL = h3.latlng_to_cell(ROAD_LATITUDE, 115.83, RESOLUTION)
TIE_LATITUDE, TIE_LONGITUDE = h3.cell_to_latlng(TIE_CELL)
MAIN_ROAD_NODES = {
    1: (115.80, ROAD_LATITUDE),
    2: (TIE_LONGITUDE, TIE_LATITUDE),
    3: (115.86, ROAD_LATITUDE),
}
# A road component that no station can reach.
ORPHAN_ROAD = ((10, (116.05, -31.93)), (11, (116.07, -31.93)))
BOUNDARY = [(115.78, -32.00), (116.10, -32.00), (116.10, -31.90), (115.78, -31.90)]


def write_geojson(path: Path, features: list[dict]) -> Path:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def line(start: int, end: int, a: tuple[float, float], b: tuple[float, float]) -> dict:
    return {
        "type": "Feature",
        "properties": {"START_NODE_NO": start, "END_NODE_NO": end, "NETWORK_TYPE": "Local Road"},
        "geometry": {"type": "LineString", "coordinates": [list(a), list(b)]},
    }


def point(name: str, longitude: float, latitude: float) -> dict:
    return {
        "type": "Feature",
        "properties": {"NAME": name},
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
    }


def square(name: str, ring: list[tuple[float, float]]) -> dict:
    return {
        "type": "Feature",
        "properties": {"name": name},
        "geometry": {"type": "Polygon", "coordinates": [[*map(list, ring), list(ring[0])]]},
    }


@pytest.fixture
def config(tmp_path: Path) -> rc.CoverageConfig:
    (orphan_start, orphan_a), (orphan_end, orphan_b) = ORPHAN_ROAD
    roads = write_geojson(tmp_path / "roads.geojson", [
        line(1, 2, MAIN_ROAD_NODES[1], MAIN_ROAD_NODES[2]),
        line(2, 3, MAIN_ROAD_NODES[2], MAIN_ROAD_NODES[3]),
        line(orphan_start, orphan_end, orphan_a, orphan_b),
    ])
    stations = write_geojson(tmp_path / "stations.geojson", [
        point("West", 115.8001, ROAD_LATITUDE + 0.001),
        point("Nowhere", 115.50, -32.50),
    ])
    boundaries = write_geojson(tmp_path / "boundaries.geojson", [square("Test LGA", BOUNDARY)])
    return rc.CoverageConfig(
        road_path=roads,
        station_path=stations,
        boundary_path=boundaries,
        output_dir=tmp_path / "out",
        layer_name="Test_Coverage",
        cache_dir=tmp_path / "out" / "cache",
        road_crs="EPSG:4326",
        station_crs="EPSG:4326",
        boundary_crs="EPSG:4326",
        h3_resolution=RESOLUTION,
    )


@pytest.fixture
def con(config: rc.CoverageConfig):
    connection = rc.run(config, export=False)
    yield connection
    connection.close()


def test_every_boundary_cell_gets_a_coverage_row(con, config):
    ring = [(latitude, longitude) for longitude, latitude in BOUNDARY]
    expected = set(h3.polygon_to_cells(h3.LatLngPoly(ring), RESOLUTION))

    cells = {row[0] for row in con.execute("SELECT h3_cell FROM coverage").fetchall()}
    classes = {row[0] for row in con.execute("SELECT DISTINCT response_class FROM coverage").fetchall()}

    assert cells == expected
    assert classes <= {"green", "yellow", "orange", "red", "unreachable"}
    assert {"green", "unreachable"} <= classes


def test_non_fire_type_is_not_a_station_source(config: rc.CoverageConfig, tmp_path: Path):
    write_geojson(tmp_path / "typed_stations.geojson", [
        {
            "type": "Feature",
            "properties": {"NAME": "Brigade", "type": "BFB"},
            "geometry": {"type": "Point", "coordinates": [115.8001, ROAD_LATITUDE + 0.001]},
        },
        {
            "type": "Feature",
            "properties": {"NAME": "SES Unit", "type": "SESU"},
            "geometry": {"type": "Point", "coordinates": [115.8002, ROAD_LATITUDE + 0.001]},
        },
    ])
    typed = dataclasses.replace(
        config,
        station_path=tmp_path / "typed_stations.geojson",
        output_dir=tmp_path / "typed-out",
        layer_name="Typed_Coverage",
        station_name_column="NAME",
        station_type_column="type",
        station_types=("BFB",),
    )
    con = rc.connect(typed)
    rc.load_inputs(con, typed)
    rc.build_road_graph(con)
    rc.create_station_sources(con)
    sources = con.execute(
        "SELECT DISTINCT s.name FROM station_sources JOIN stations AS s USING (station_id)"
    ).fetchall()
    names = con.execute("SELECT name FROM stations ORDER BY name").fetchall()
    con.close()

    assert sources == [("Brigade",)]
    assert names == [("Brigade",)]


def test_for_dfes_uses_fire_station_types(tmp_path: Path):
    police = rc.CoverageConfig.for_repository(tmp_path)
    dfes = rc.CoverageConfig.for_dfes(tmp_path)

    assert police.station_name_column == "NAME"
    assert police.station_types is None
    assert "each police station" in rc.build_metadata(police)["method"]
    assert "station_types" not in rc.build_metadata(police)

    assert dfes.road_path == police.road_path
    assert dfes.boundary_path == police.boundary_path
    assert dfes.output_dir == police.output_dir
    assert dfes.cache_dir == police.cache_dir
    assert dfes.road_speed_kmh == police.road_speed_kmh
    assert dfes.station_path == (
        tmp_path / "data" / "raw" / "DFES_Stations_DFES_023_WA_GDA2020_Public.geojson"
    )
    assert dfes.station_crs == "EPSG:7844"
    assert dfes.layer_name == "DFES_Response_Coverage"
    assert dfes.station_name_column == "displaynam"
    assert dfes.station_type_column == "type"
    assert dfes.station_types == ("BFB", "VFRS", "VFESU", "CFRS", "PFRS")
    metadata = rc.build_metadata(dfes)
    assert "each DFES fire station" in metadata["method"]
    assert metadata["station_types"] == ["BFB", "VFRS", "VFESU", "CFRS", "PFRS"]


def test_station_without_nearby_road_contributes_nothing(con):
    station_ids = con.execute(
        "SELECT DISTINCT s.name FROM station_sources JOIN stations AS s USING (station_id)"
    ).fetchall()
    max_stations = con.execute("SELECT max(reachable_stations) FROM coverage").fetchone()[0]

    assert station_ids == [("West",)]
    assert max_stations == 1


def test_orphaned_road_component_is_never_snapped_to(con):
    orphan_snaps = con.execute("""
        SELECT count(*)
        FROM cell_segments JOIN roads USING (segment_id)
        WHERE roads.start_node_no = 10
    """).fetchone()[0]
    unreachable_without_snap = con.execute("""
        SELECT count(*) FROM coverage
        WHERE response_class = 'unreachable' AND road_segment_count = 0 AND reachable_stations = 0
    """).fetchone()[0]

    assert orphan_snaps == 0
    assert unreachable_without_snap == con.execute(
        "SELECT count(*) FROM coverage WHERE response_class = 'unreachable'"
    ).fetchone()[0]


def test_response_time_is_access_plus_network_time_to_nearest_endpoint(con):
    # The station connects to both endpoints of its nearest segment (nodes 1 and 2) by
    # straight-line access. A cell snapped to the second segment (nodes 2–3) is reached
    # at node 2, either directly or via node 1 and the first segment, whichever is faster.
    access = dict(con.execute("""
        SELECT n.node_no, ss.access_minutes
        FROM station_sources AS ss JOIN road_nodes AS n USING (node_id)
    """).fetchall())
    first_segment_minutes = con.execute(
        "SELECT weight_minutes FROM segments WHERE segment_id = 0"
    ).fetchone()[0]
    far_cell = h3.latlng_to_cell(ROAD_LATITUDE, 115.86, RESOLUTION)

    snapped_segment, actual = con.execute("""
        SELECT s.segment_id, c.min_response_minutes
        FROM coverage AS c
        JOIN h3_cells AS h USING (h3_cell)
        JOIN cell_segments AS s USING (cell_id)
        WHERE c.h3_cell = ?
    """, [far_cell]).fetchone()

    assert snapped_segment == 1
    assert sorted(access) == [1, 2]
    assert actual == round(min(access[2], access[1] + first_segment_minutes), 2)


def test_distance_ties_go_to_the_lowest_segment_id(con):
    segment_id = con.execute("""
        SELECT segment_id FROM cell_segments JOIN h3_cells USING (cell_id) WHERE h3_cell = ?
    """, [TIE_CELL]).fetchone()[0]

    assert segment_id == 0


def test_tiled_polyfill_matches_the_whole_polygon():
    star = shapely.Polygon([
        (115.80, -32.00), (115.86, -31.97), (115.95, -32.00), (115.90, -31.93),
        (115.95, -31.86), (115.86, -31.90), (115.80, -31.86), (115.83, -31.93),
    ]).difference(shapely.Point(115.87, -31.93).buffer(0.015))

    pieces = rc.split_polygon(star, max_vertices=8)
    tiled = set().union(*(rc.polygon_to_cells(piece, 9) for piece in pieces))

    assert len(pieces) > 4
    assert tiled == rc.polygon_to_cells(star, 9)


def test_grid_cache_is_reused_until_the_boundary_changes(config, monkeypatch):
    con = rc.connect(config)
    rc.load_inputs(con, config)
    first_count, first_from_cache = rc.generate_full_grid(con, config)

    def fail_polyfill(*_args):
        raise AssertionError("polyfill should not run when the cache is valid")

    with monkeypatch.context() as patch:
        patch.setattr(rc, "polyfill_boundaries", fail_polyfill)
        second_count, second_from_cache = rc.generate_full_grid(con, config)

    smaller = [(115.78, -32.00), (115.90, -32.00), (115.90, -31.90), (115.78, -31.90)]
    write_geojson(config.boundary_path, [square("Smaller LGA", smaller)])
    rc.load_inputs(con, config)
    third_count, third_from_cache = rc.generate_full_grid(con, config)
    con.close()

    assert (first_from_cache, second_from_cache, third_from_cache) == (False, True, False)
    assert second_count == first_count
    assert third_count < first_count


def test_geoparquet_source_cache_matches_direct_reads(config):
    tables = ("roads", "stations", "boundaries")

    def snapshot(run_config: rc.CoverageConfig) -> dict[str, list[tuple]]:
        con = rc.connect(run_config)
        rc.load_inputs(con, run_config)
        rows = {
            table: con.execute(f"""
                SELECT * EXCLUDE (geom, projected_geom), ST_AsText(geom), ST_AsText(projected_geom)
                FROM {table} ORDER BY ALL
            """).fetchall()
            for table in tables
        }
        con.close()
        return rows

    direct = snapshot(dataclasses.replace(config, cache_dir=None))
    cached = snapshot(config)
    cached_files = sorted(path.name for path in config.cache_dir.glob("source_*.parquet"))
    write_geojson(config.station_path, [point("Moved", 115.81, ROAD_LATITUDE)])
    after_change = snapshot(config)

    assert cached == direct
    assert len(cached_files) == 3
    assert [row[1] for row in after_change["stations"]] == ["Moved"]
    assert len(list(config.cache_dir.glob("source_*.parquet"))) == 3


@pytest.mark.skipif(shutil.which("tippecanoe") is None, reason="tippecanoe is not installed")
def test_export_writes_pmtiles_and_metadata(con, config):
    paths = rc.export_coverage(con, config)

    assert paths["pmtiles"].stat().st_size > 0
    exported = con.execute(
        f"SELECT count(*), count(DISTINCT h3_cell) FROM ST_Read('{paths['flatgeobuf']}')"
    ).fetchone()
    cells = con.execute("SELECT count(*) FROM coverage").fetchone()[0]
    assert exported == (cells, cells)
    metadata = json.loads(paths["metadata"].read_text())
    assert metadata["h3_resolution"] == RESOLUTION

#!/usr/bin/env python3
"""Build the GZM resident-population snapshot from pinned official inputs.

Uses only the Python standard library. Source geometries are in EPSG:2180;
cell centers are transformed to lon/lat with the inverse Transverse Mercator
formula for ETRS89 / Poland CS92 (GRS80 ellipsoid).
"""

from __future__ import annotations

import json
import math
import struct
import zipfile
from itertools import zip_longest
from pathlib import Path
from fetch_boundaries import NAMES
from fetch_sources import load_sources, verify_source


HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources"
CATALOG = {source["id"]: source for source in load_sources()}
GRID_ZIP = SOURCES / CATALOG["gus-resident-grid"]["filename"]
BOUNDARIES = SOURCES / CATALOG["prg-boundaries"]["filename"]
JSON_OUT = HERE / "population-density.json"
JS_OUT = HERE / "population-density.js"

GRID_SHA256 = CATALOG["gus-resident-grid"]["sha256"]
BOUNDARIES_SHA256 = CATALOG["prg-boundaries"]["sha256"]


def read_dbf_records(raw: bytes):
    row_count, header_len, record_len = struct.unpack_from("<IHH", raw, 4)
    fields = []
    pos = 32
    while raw[pos] != 0x0D:
        desc = raw[pos : pos + 32]
        name = desc[:11].split(b"\0", 1)[0].decode("ascii")
        fields.append((name, desc[11:12].decode("ascii"), desc[16]))
        pos += 32

    def records():
        for i in range(row_count):
            row = raw[header_len + i * record_len : header_len + (i + 1) * record_len]
            if not row or row[0:1] == b"*":
                yield None
                continue
            values = {}
            offset = 1
            for name, _kind, width in fields:
                values[name] = row[offset : offset + width].decode("ascii", "ignore").strip()
                offset += width
            yield values

    return row_count, records()


def shape_centers(raw: bytes):
    """Yield projected polygon bbox centers in the same order as the DBF."""
    pos = 100
    while pos < len(raw):
        _record_number, content_words = struct.unpack_from(">ii", raw, pos)
        body = pos + 8
        shape_type = struct.unpack_from("<i", raw, body)[0]
        if shape_type == 0:
            yield None
        elif shape_type == 5:  # Polygon
            xmin, ymin, xmax, ymax = struct.unpack_from("<4d", raw, body + 4)
            yield ((xmin + xmax) / 2.0, (ymin + ymax) / 2.0)
        else:
            raise ValueError(f"Unexpected shapefile geometry type {shape_type}")
        pos = body + content_words * 2


def shape_polygons(raw: bytes):
    """Yield each polygon record's bbox center and exact EPSG:2180 rings."""
    pos = 100
    while pos < len(raw):
        _record_number, content_words = struct.unpack_from(">ii", raw, pos)
        body = pos + 8
        shape_type = struct.unpack_from("<i", raw, body)[0]
        if shape_type == 0:
            yield None
        elif shape_type == 5:  # Polygon
            xmin, ymin, xmax, ymax = struct.unpack_from("<4d", raw, body + 4)
            part_count, point_count = struct.unpack_from("<2i", raw, body + 36)
            part_offsets = struct.unpack_from(f"<{part_count}i", raw, body + 44)
            point_offset = body + 44 + 4 * part_count
            points = [struct.unpack_from("<2d", raw, point_offset + 16 * i) for i in range(point_count)]
            rings = []
            for i, start in enumerate(part_offsets):
                end = part_offsets[i + 1] if i + 1 < part_count else point_count
                rings.append(points[start:end])
            yield ((xmin + xmax) / 2.0, (ymin + ymax) / 2.0), rings
        else:
            raise ValueError(f"Unexpected shapefile geometry type {shape_type}")
        pos = body + content_words * 2


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[i + 1][:2]
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if (
            abs(cross) < 1e-7
            and min(x1, x2) - 1e-7 <= x <= max(x1, x2) + 1e-7
            and min(y1, y2) - 1e-7 <= y <= max(y1, y2) + 1e-7
        ):
            return True
        if (y1 > y) != (y2 > y):
            x_cross = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < x_cross:
                inside = not inside
    return inside


def point_in_polygon(x: float, y: float, polygon: list[list[list[float]]]) -> bool:
    return bool(polygon) and point_in_ring(x, y, polygon[0]) and not any(
        point_in_ring(x, y, hole) for hole in polygon[1:]
    )


def load_city_polygons():
    data = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
    cities = []
    for feature in data["features"]:
        props = feature["properties"]
        code = str(props["teryt"])
        if props["nazwa"] not in NAMES:
            continue
        geometry = feature["geometry"]
        if geometry["type"] != "MultiPolygon":
            raise ValueError(f"Expected MultiPolygon for {props['nazwa']}")
        multipolygon = geometry["coordinates"]
        points = [point for polygon in multipolygon for ring in polygon for point in ring]
        bounds = (
            min(point[0] for point in points),
            min(point[1] for point in points),
            max(point[0] for point in points),
            max(point[1] for point in points),
        )
        cities.append(
            {"teryt": code, "name": props["nazwa"], "geometry": multipolygon, "bounds": bounds}
        )
    if {city["name"] for city in cities} != set(NAMES):
        raise ValueError("Pinned PRG snapshot does not contain all 43 requested municipalities")
    return sorted(cities, key=lambda city: city["teryt"])


def city_for_center(x: float, y: float, cities):
    for city in cities:
        xmin, ymin, xmax, ymax = city["bounds"]
        if xmin <= x <= xmax and ymin <= y <= ymax:
            if any(point_in_polygon(x, y, polygon) for polygon in city["geometry"]):
                return city
    return None


def cs92_to_lonlat(x: float, y: float) -> tuple[float, float]:
    """Inverse EPSG:2180 (ETRS89 / Poland CS92) to geographic degrees."""
    a = 6378137.0
    f = 1.0 / 298.257222101  # GRS80 flattening
    e2 = f * (2.0 - f)
    ep2 = e2 / (1.0 - e2)
    k0 = 0.9993
    x0, y0 = 500000.0, -5300000.0
    lon0 = math.radians(19.0)

    xx = x - x0
    m = (y - y0) / k0
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    mu = m / (
        a
        * (
            1.0
            - e2 / 4.0
            - 3.0 * e2**2 / 64.0
            - 5.0 * e2**3 / 256.0
            - 175.0 * e2**4 / 16384.0
        )
    )
    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1**3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1**2 / 16.0 - 55.0 * e1**4 / 32.0) * math.sin(4.0 * mu)
        + 151.0 * e1**3 / 96.0 * math.sin(6.0 * mu)
        + 1097.0 * e1**4 / 512.0 * math.sin(8.0 * mu)
    )

    sin_phi = math.sin(phi1)
    cos_phi = math.cos(phi1)
    tan_phi = math.tan(phi1)
    n1 = a / math.sqrt(1.0 - e2 * sin_phi**2)
    r1 = a * (1.0 - e2) / (1.0 - e2 * sin_phi**2) ** 1.5
    t1 = tan_phi**2
    c1 = ep2 * cos_phi**2
    d = xx / (n1 * k0)

    lat = phi1 - (n1 * tan_phi / r1) * (
        d**2 / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1**2 - 9.0 * ep2) * d**4 / 24.0
        + (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1**2 - 252.0 * ep2 - 3.0 * c1**2)
        * d**6
        / 720.0
    )
    lon = lon0 + (
        d
        - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1**2 + 8.0 * ep2 + 24.0 * t1**2)
        * d**5
        / 120.0
    ) / cos_phi
    return math.degrees(lon), math.degrees(lat)


def project_ring_to_wgs84(ring):
    projected = []
    for x, y, *rest in ring:
        lon, lat = cs92_to_lonlat(x, y)
        projected.append([round(lon, 7), round(lat, 7), *rest])
    return projected


def build_data():
    verify_source(CATALOG["gus-resident-grid"])
    verify_source(CATALOG["prg-boundaries"])

    with zipfile.ZipFile(GRID_ZIP) as archive:
        shapes = archive.read("GRID_NSP2021_RES.shp")
        dbf = archive.read("GRID_NSP2021_RES.dbf")
    row_count, rows = read_dbf_records(dbf)
    cities = load_city_polygons()
    cells = []
    mask_cells = []
    city_totals = {city["teryt"]: 0 for city in cities}
    city_cell_counts = {city["teryt"]: 0 for city in cities}
    city_demand_counts = {city["teryt"]: 0 for city in cities}

    processed = 0
    sentinel = object()
    shape_iter = shape_polygons(shapes)
    for row, shape in zip_longest(rows, shape_iter, fillvalue=sentinel):
        if row is sentinel or shape is sentinel:
            raise ValueError("Shapefile and DBF row counts do not match")
        processed += 1
        if row is None or shape is None:
            continue
        (x, y), rings = shape
        city = city_for_center(x, y, cities)
        if city is None:
            continue
        lon, lat = cs92_to_lonlat(x, y)
        if not row.get("RES"):
            continue
        population = int(row["RES"])
        city_totals[city["teryt"]] += population
        city_cell_counts[city["teryt"]] += 1
        if len(rings) != 1:
            raise ValueError(f"Expected one native polygon ring for grid cell {row['PL_CODE']}")
        # Convert each native GUS cell vertex to WGS84, retaining the source ring.
        ring = project_ring_to_wgs84(rings[0])
        mask_cells.append(
            {
                "id": row["PL_CODE"],
                "teryt": city["teryt"],
                "city": city["name"],
                "lon": round(lon, 6),
                "lat": round(lat, 6),
                "population": population,
                "areaKm2": 1.0,
                "density": float(population),
                "geometry": {"type": "Polygon", "coordinates": [ring]},
            }
        )
        if population > 0:
            city_demand_counts[city["teryt"]] += 1
            cells.append(
                {
                    "id": row["PL_CODE"],
                    "teryt": city["teryt"],
                    "city": city["name"],
                    "lon": round(lon, 6),
                    "lat": round(lat, 6),
                    "population": population,
                    "areaKm2": 1.0,
                    "density": float(population),
                }
            )

    cells.sort(key=lambda cell: (cell["teryt"], cell["id"]))
    mask_cells.sort(key=lambda cell: (cell["teryt"], cell["id"]))
    if processed != row_count:
        raise ValueError(f"Expected {row_count} source records, processed {processed}")
    city_stats = [
        {
            "name": city["name"],
            "teryt": city["teryt"],
            "residentPopulationInSelectedCells": city_totals[city["teryt"]],
            "selectedGridCells": city_cell_counts[city["teryt"]],
            "positivePopulationCells": city_demand_counts[city["teryt"]],
        }
        for city in cities
    ]
    city_boundaries = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"teryt": city["teryt"], "name": city["name"]},
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [
                        [project_ring_to_wgs84(ring) for ring in polygon]
                        for polygon in city["geometry"]
                    ],
                },
            }
            for city in cities
        ],
    }
    boundary_points = [point for feature in city_boundaries["features"] for polygon in feature["geometry"]["coordinates"] for ring in polygon for point in ring]
    game_bbox = [min(p[0] for p in boundary_points), min(p[1] for p in boundary_points), max(p[0] for p in boundary_points), max(p[1] for p in boundary_points)]
    data = {
        "source": {
            "shortName": "GUS 1 km resident grid",
            "name": "Główny Urząd Statystyczny, 2021 census resident population grid (NSP 2021, 1 km)",
            "year": 2021,
            "url": "https://geo.stat.gov.pl/atom-web/atom/PD?spatial_dataset_identifier_code=PD.GRID.2021&spatial_dataset_identifier_namespace=http://geo.stat.gov.pl/id/dataset/PL.ZIPGUS.2827",
            "downloadUrl": "https://geo.stat.gov.pl/atom-web/download/?fileId=2795b7ed9098f86ab761352519ba1d85&name=GRID_NSP2021_RES.zip",
            "date": "2021 census (reference date: 2021-03-31)",
            "published": "2022-12-23",
            "retrieved": "2026-09-24",
            "license": "GUS ATOM rights: no access or use conditions; no restrictions on public access. GUS Portal terms require source attribution to geo.stat.gov.pl and the retrieval date; no named CC license is stated.",
            "attribution": "Source: Główny Urząd Statystyczny, geo.stat.gov.pl; retrieved 2026-09-24.",
            "unit": "residents per 1 km × 1 km statistical grid cell",
            "populationDefinition": "resident population (ludność rezydująca), field RES",
            "resolutionMeters": 1000,
            "inputCrs": "EPSG:2180 (ETRS89 / Poland CS92)",
            "gridZipSha256": GRID_SHA256,
        },
        "boundarySource": {
            "name": "GUGiK National Register of Boundaries (PRG), municipal units layer",
            "url": "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0",
            "queryUrl": "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query",
            "retrieved": "2026-09-25",
            "license": "Geoportal states PRG data are free to use for any purpose.",
            "snapshotFile": "sources/city-boundaries-prg.geojson",
            "snapshotSha256": BOUNDARIES_SHA256,
            "inputCrs": "EPSG:2180",
            "outputCrs": "WGS84 longitude/latitude",
        },
        "bbox": game_bbox,
        "bboxOrder": "[west, south, east, north] in WGS84 longitude/latitude",
        "cities": city_stats,
        "cellSelection": "Whole native 1 km GUS cells whose center lies inside one of the 43 pinned PRG municipal boundaries. Each published RES count is retained in full; boundary-crossing cells are assigned by center, not clipped or fractionally allocated. Cell polygons can extend across municipal boundaries by up to roughly half a cell.",
        "cellCount": len(cells),
        "maskCellCount": len(mask_cells),
        "totalPopulation": sum(city_totals.values()),
        "cells": cells,
        "maskCells": mask_cells,
        "cityBoundaries": city_boundaries,
    }
    return data, row_count


def main():
    data, source_rows = build_data()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    JSON_OUT.write_text(payload + "\n", encoding="utf-8")
    JS_OUT.write_text("window.GZM_POPULATION=" + payload + ";\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "sourceRows": source_rows,
                "cellCount": data["cellCount"],
                "totalPopulation": data["totalPopulation"],
                "cities": data["cities"],
                "jsonBytes": JSON_OUT.stat().st_size,
                "jsBytes": JS_OUT.stat().st_size,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

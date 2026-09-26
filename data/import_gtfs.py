#!/usr/bin/env python3
"""Rebuild the pinned GZM network snapshot from the included source GTFS ZIPs."""

import csv
import hashlib
import io
import json
import math
from datetime import datetime
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
SOURCES = [
    ("ztm", HERE / "sources" / "gzm-2026-09-23.zip", "f4f5173db8b2325d70610d89865ebd62617bae33efdc33266026343ad5ec42d8"),
    ("ks", HERE / "sources" / "ks-2025-2026.zip", "fa1e524d4a57cecff1979214f335b00a2ce7edb0eb37070641a9a2ab1cf75adb"),
]
PKM_SNAPSHOT = HERE / "sources" / "pkm-jaworzno-2026-09-26.json"
PKM_SHA256 = "cdb23ed4fc5300a542a0ef940ff841efb2b0e4c34188969164a0e8132bbe19fb"
POPULATION = json.loads((HERE / "population-density.json").read_text(encoding="utf-8"))
CORE = tuple(POPULATION["bbox"])
BBOX = (CORE[0] - .025, CORE[1] - .018, CORE[2] + .025, CORE[3] + .018)
CITY_GEOMETRIES = []
for feature in POPULATION["cityBoundaries"]["features"]:
    polygons = feature["geometry"]["coordinates"]
    points = [p for polygon in polygons for ring in polygon for p in ring]
    bounds = (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
    center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    CITY_GEOMETRIES.append((feature["properties"]["name"], polygons, bounds, center))


def inside(pos, box=BBOX):
    return box[0] <= pos[0] <= box[2] and box[1] <= pos[1] <= box[3]


def read_rows(z, name):
    with io.TextIOWrapper(z.open(name + ".txt"), encoding="utf-8-sig", newline="") as file:
        yield from csv.DictReader(file)


def simplify(points, epsilon=0.00023):
    if len(points) <= 2:
        return points
    # Retain turns and landmarks while reducing browser-side geometry.
    kept = [points[0]]
    anchor = points[0]
    for i in range(1, len(points) - 1):
        a, b, c = anchor, points[i], points[i + 1]
        cross = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        base = math.hypot(c[0] - a[0], c[1] - a[1]) or 1
        if cross / base > epsilon or math.hypot(c[0] - a[0], c[1] - a[1]) > 0.012:
            kept.append(b)
            anchor = b
    kept.append(points[-1])
    return kept


def clipped_shape(points):
    segments, segment = [], []
    for p in points:
        if inside(p):
            segment.append(p)
        elif segment:
            if len(segment) >= 2:
                segments.append(simplify(segment))
            segment = []
    if len(segment) >= 2:
        segments.append(simplify(segment))
    return segments


def in_ring(pos, ring):
    x, y = pos
    inside_ring = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[i + 1][:2]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside_ring = not inside_ring
    return inside_ring


def focus_city(pos):
    if not inside(pos, CORE):
        return None
    for name, polygons, bounds, _center in CITY_GEOMETRIES:
        if not inside(pos, bounds):
            continue
        if any(in_ring(pos, polygon[0]) and not any(in_ring(pos, hole) for hole in polygon[1:]) for polygon in polygons):
            return name
    return None


def city(name, pos):
    found = focus_city(pos)
    if found:
        return found
    return min(CITY_GEOMETRIES, key=lambda item: (pos[0] - item[3][0]) ** 2 + (pos[1] - item[3][1]) ** 2)[0]


def load_source(source, path):
    with ZipFile(path) as z:
        service_date = "20260923"
        weekday = datetime.strptime(service_date, "%Y%m%d").strftime("%A").lower()
        active_services = {
            row["service_id"] for row in read_rows(z, "calendar")
            if row["start_date"] <= service_date <= row["end_date"] and row[weekday] == "1"
        }
        if "calendar_dates.txt" in z.namelist():
            for row in read_rows(z, "calendar_dates"):
                if row["date"] == service_date:
                    if row["exception_type"] == "1":
                        active_services.add(row["service_id"])
                    elif row["exception_type"] == "2":
                        active_services.discard(row["service_id"])
        stops = {}
        for row in read_rows(z, "stops"):
            try:
                pos = [round(float(row["stop_lon"]), 7), round(float(row["stop_lat"]), 7)]
            except (KeyError, ValueError):
                continue
            stops[row["stop_id"]] = {"id": f"{source}:{row['stop_id']}", "name": row["stop_name"], "pos": pos, "city": city(row["stop_name"], pos)}
        focus_stop_ids = {sid for sid, value in stops.items() if focus_city(value["pos"])}

        routes = {r["route_id"]: r for r in read_rows(z, "routes")}
        trips = {}
        by_route = defaultdict(list)
        for trip in read_rows(z, "trips"):
            if trip["service_id"] not in active_services:
                continue
            trips[trip["trip_id"]] = trip
            by_route[trip["route_id"]].append(trip["trip_id"])

        times = defaultdict(list)
        for row in read_rows(z, "stop_times"):
            if row["trip_id"] in trips:
                times[row["trip_id"]].append((int(row["stop_sequence"]), row["stop_id"]))
        for value in times.values():
            value.sort()

        candidates = []
        used_shape_ids = set()
        for route_id, trip_ids in by_route.items():
            route = routes.get(route_id)
            if not route:
                continue
            mode = {"0": "tram", "2": "rail", "3": "bus", "11": "bus"}.get(route.get("route_type"))
            if not mode:
                continue
            valid = []
            for tid in trip_ids:
                sequence = [sid for _, sid in times.get(tid, []) if sid in stops]
                in_core = [sid for sid in sequence if sid in focus_stop_ids]
                if len(in_core) >= 2:
                    valid.append((tid, sequence, len(in_core)))
            if not valid:
                continue
            grouped = defaultdict(list)
            for tid, seq, count in valid:
                trip = trips[tid]
                grouped[(trip.get("direction_id", ""), trip.get("shape_id", ""))].append((tid, seq, count))
            # Two directions are retained when both have service in the focus area.
            for direction in sorted({key[0] for key in grouped}):
                choices = [(key, rows) for key, rows in grouped.items() if key[0] == direction]
                choices.sort(key=lambda item: (len(item[1]), max(x[2] for x in item[1])), reverse=True)
                key, group = choices[0]
                tid, sequence, _ = max(group, key=lambda item: item[2])
                in_box_indices = [i for i, sid in enumerate(sequence) if inside(stops[sid]["pos"])]
                if len(in_box_indices) < 2:
                    continue
                sequence = sequence[in_box_indices[0] : in_box_indices[-1] + 1]
                sequence = [sid for sid in sequence if inside(stops[sid]["pos"])]
                if len(sequence) < 2:
                    continue
                shape_id = trips[tid].get("shape_id", "")
                if shape_id:
                    used_shape_ids.add(shape_id)
                candidates.append({
                    "id": f"{source}:{route_id}:{direction or '0'}",
                    "source": source,
                    "name": route.get("route_short_name") or route_id,
                    "longName": route.get("route_long_name") or "",
                    "mode": mode,
                    "color": "#" + (route.get("route_color") or {"bus": "EF705E", "tram": "15B8C7", "rail": "5387EF"}[mode]).lstrip("#"),
                    "stopIds": [stops[sid]["id"] for sid in sequence],
                    "shapeId": shape_id,
                    "direction": direction,
                    "tripCount": len([tid for tid in trip_ids if trips[tid].get("direction_id", "") == direction]),
                })

        shapes = defaultdict(list)
        if used_shape_ids:
            for row in read_rows(z, "shapes"):
                sid = row["shape_id"]
                if sid in used_shape_ids:
                    shapes[sid].append((int(row["shape_pt_sequence"]), [round(float(row["shape_pt_lon"]), 7), round(float(row["shape_pt_lat"]), 7)]))
        for r in candidates:
            shape = [pos for _, pos in sorted(shapes.get(r.pop("shapeId"), []))]
            r["geometry"] = clipped_shape(shape) if shape else [[stops[sid.split(":", 1)[1]]["pos"] for sid in r["stopIds"]]]
            if not r["geometry"]:
                r["geometry"] = [[stops[sid.split(":", 1)[1]]["pos"] for sid in r["stopIds"]]]
            # Typical scheduled interval is a transparent estimate from daily trip count.
            r["headway"] = max(6, min(90, round(14 * 60 / max(1, r.pop("tripCount")))))
        used_stops = {sid for r in candidates for sid in r["stopIds"]}
        output_stops = [stop for stop in stops.values() if stop["id"] in used_stops]
        return candidates, output_stops


def main():
    routes, stops = [], []
    for source, path, expected_hash in SOURCES:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != expected_hash:
            raise SystemExit(f"Unexpected hash for {path.name}: {digest}")
        source_routes, source_stops = load_source(source, path)
        routes.extend(source_routes)
        stops.extend(source_stops)
        print(source, len(source_routes), "patterns", len(source_stops), "stops")
    if hashlib.sha256(PKM_SNAPSHOT.read_bytes()).hexdigest() != PKM_SHA256:
        raise SystemExit("Unexpected hash for PKM Jaworzno timetable snapshot")
    pkm = json.loads(PKM_SNAPSHOT.read_text(encoding="utf-8"))
    for s in pkm["stops"]:
        s["city"] = city(s["name"], s["pos"])
    routes.extend(pkm["routes"])
    stops.extend(pkm["stops"])
    print("pkm", len(pkm["routes"]), "patterns", len(pkm["stops"]), "stops")
    routes.sort(key=lambda r: ({"tram": 0, "rail": 1, "bus": 2}[r["mode"]], r["name"], r["direction"]))
    stops.sort(key=lambda s: s["id"])
    output = {
        "version": "2026-09-23-gzm-v4",
        "focus": [city["name"] for city in POPULATION["cities"]],
        "bbox": BBOX,
        "sources": [
            {"name": "GZM ZTM", "version": "schedule_ZTM_2026.09.23_11277_0005", "date": "2026-09-23", "license": "CC BY", "url": "https://otwartedane.metropoliagzm.pl/dataset/rozklady-jazdy-i-lokalizacja-przystankow-gtfs-wersja-rozszerzona", "sha256": SOURCES[0][2]},
            {"name": "Koleje Śląskie", "version": "2025-2026", "date": "2026-09-23 download", "license": "See source terms", "url": "https://koleje-ks.pl/gtfs/2025-2026.zip", "sha256": SOURCES[1][2]},
            {"name": "PKM Jaworzno", "version": "official public timetable snapshot", "date": "2026-09-26 retrieval", "license": "Source terms not stated; link to operator", "url": "https://www.pkm.jaworzno.pl/rozklady/start.php", "sha256": PKM_SHA256, "note": pkm["method"]},
        ],
        "routes": routes,
        "stops": stops,
    }
    destination = HERE / "network.json"
    compact = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    destination.write_text(compact, encoding="utf-8")
    (HERE / "network.js").write_text("window.GZM_NETWORK=" + compact + ";\n", encoding="utf-8")
    print(destination, destination.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

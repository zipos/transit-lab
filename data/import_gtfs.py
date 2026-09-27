#!/usr/bin/env python3
"""Rebuild the pinned GZM network snapshot from fetched, hash-pinned source files."""

import csv
import io
import json
import math
import re
import sys
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

from fetch_sources import load_sources, verify_source

HERE = Path(__file__).resolve().parent

CATALOG = {source["id"]: source for source in load_sources()}
SOURCES = [
    ("ztm", HERE / "sources" / CATALOG["gzm-ztm"]["filename"], CATALOG["gzm-ztm"]["sha256"]),
    ("ks", HERE / "sources" / CATALOG["koleje-slaskie"]["filename"], CATALOG["koleje-slaskie"]["sha256"]),
]
PKM_SNAPSHOT = HERE / "sources" / CATALOG["pkm-jaworzno"]["filename"]
PKM_SHA256 = CATALOG["pkm-jaworzno"]["sha256"]
POPULATION = json.loads((HERE / "gzm" / "population.json").read_text(encoding="utf-8"))
CORE = tuple(POPULATION["bbox"])
BBOX = (CORE[0] - .025, CORE[1] - .018, CORE[2] + .025, CORE[3] + .018)
CITY_GEOMETRIES = []
for feature in POPULATION["cityBoundaries"]["features"]:
    polygons = feature["geometry"]["coordinates"]
    points = [p for polygon in polygons for ring in polygon for p in ring]
    bounds = (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
    center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    CITY_GEOMETRIES.append((feature["properties"]["name"], polygons, bounds, center))


def gtfs_mode(route_type):
    try:
        code = int(route_type)
    except (TypeError, ValueError):
        return None
    if code in {0} or 900 <= code <= 906:
        return "tram"
    if code in {2} or 100 <= code <= 117:
        return "rail"
    if code in {1, 12} or 400 <= code <= 405:
        return "metro"
    if code in {3, 11} or 700 <= code <= 716:
        return "bus"
    return None


def km(a, b):
    lon_scale = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * lon_scale, a[1] - b[1]) * 111.195


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


def clock_minutes(value):
    if not value or not str(value).strip():
        return None
    parts = str(value).strip().split(":")
    if len(parts) < 2:
        return None
    hours, minutes = int(parts[0]), int(parts[1])
    seconds = int(parts[2]) if len(parts) > 2 else 0
    return hours * 60 + minutes + seconds / 60


def active_services(z, service_date):
    weekday = datetime.strptime(service_date, "%Y%m%d").strftime("%A").lower()
    active = {
        row["service_id"] for row in read_rows(z, "calendar")
        if row["start_date"] <= service_date <= row["end_date"] and row[weekday] == "1"
    }
    if "calendar_dates.txt" in z.namelist():
        for row in read_rows(z, "calendar_dates"):
            if row["date"] != service_date:
                continue
            if row["exception_type"] == "1":
                active.add(row["service_id"])
            elif row["exception_type"] == "2":
                active.discard(row["service_id"])
    return active


def first_saturday(z, on_or_after):
    start = datetime.strptime(on_or_after, "%Y%m%d")
    dates = set()
    for row in read_rows(z, "calendar"):
        if row.get("saturday") != "1":
            continue
        cursor = datetime.strptime(row["start_date"], "%Y%m%d")
        end = datetime.strptime(row["end_date"], "%Y%m%d")
        while cursor <= end:
            if cursor.strftime("%A") == "Saturday" and cursor >= start:
                dates.add(cursor.strftime("%Y%m%d"))
                break
            cursor += timedelta(days=1)
    if "calendar_dates.txt" in z.namelist():
        for row in read_rows(z, "calendar_dates"):
            if row["exception_type"] != "1" or row["date"] < on_or_after:
                continue
            if datetime.strptime(row["date"], "%Y%m%d").strftime("%A") == "Saturday":
                dates.add(row["date"])
    return min(dates) if dates else None


def relative_luminance(color):
    hex_color = color.lstrip("#")
    if len(hex_color) != 6 or any(c not in "0123456789abcdefABCDEF" for c in hex_color):
        return None
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def linear(channel):
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def meaningful_color(route):
    raw = (route.get("route_color") or "").strip().lstrip("#")
    if not raw:
        return None, None
    source = "#" + raw.upper()
    luminance = relative_luminance(source)
    usable = luminance is not None and 0.03 <= luminance <= 0.9
    return ({"color": "#" + raw.lower()} if usable else {}), source


def clip_calls(calls, stops):
    inside_indexes = [index for index, call in enumerate(calls) if inside(stops[call[0]]["pos"])]
    if len(inside_indexes) < 2:
        return None
    clipped = [call for call in calls[inside_indexes[0]:inside_indexes[-1] + 1] if inside(stops[call[0]]["pos"])]
    return clipped if len(clipped) >= 2 else None


def median(values):
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def scheduled_times(samples):
    if not samples:
        return None
    times = [0.0]
    width = len(samples[0])
    for index in range(1, width):
        deltas = [max(0.3, sample[index] - sample[index - 1]) for sample in samples if len(sample) == width]
        if not deltas:
            return None
        times.append(times[-1] + median(deltas))
    return [round(value, 2) for value in times]


def departures_in_window(trips, first_stop, start, end):
    count = 0
    for calls in trips:
        for sid, _arr, dep, _no_board, _no_alight in calls:
            if sid == first_stop and dep is not None and start <= dep < end:
                count += 1
                break
    return count


def daypart(trips, sequence, start, end):
    count = departures_in_window(trips, sequence[0], start, end)
    if count <= 0:
        return None
    samples = []
    for calls in trips:
        positions = {}
        cursor = 0
        for sid, arr, dep, _no_board, _no_alight in calls:
            if cursor < len(sequence) and sid == sequence[cursor]:
                positions[cursor] = arr if arr is not None else dep
                cursor += 1
        if cursor != len(sequence) or any(positions[i] is None for i in range(len(sequence))):
            continue
        first_departure = next(dep for sid, _arr, dep, _nb, _na in calls if sid == sequence[0] and dep is not None)
        if not (start <= first_departure < end):
            continue
        origin = positions[0]
        samples.append([positions[index] - origin for index in range(len(sequence))])
    return {
        "headway": max(2, min(120, round(180 / count))),
        "trips": count,
        "times": scheduled_times(samples),
    }


def all_day_times(trips, sequence):
    samples = []
    for calls in trips:
        positions = {}
        cursor = 0
        for sid, arrival, departure, _no_board, _no_alight in calls:
            if cursor < len(sequence) and sid == sequence[cursor]:
                positions[cursor] = arrival if arrival is not None else departure
                cursor += 1
        if cursor != len(sequence) or any(positions[index] is None for index in range(len(sequence))):
            continue
        origin = positions[0]
        samples.append([positions[index] - origin for index in range(len(sequence))])
    return scheduled_times(samples)


def is_reverse(sequence, reference):
    positions = {sid: index for index, sid in enumerate(reference)}
    common = [positions[sid] for sid in sequence if sid in positions]
    if len(common) < 2:
        return False
    inversions = sum(1 for index in range(len(common) - 1) if common[index] > common[index + 1])
    return inversions > (len(common) - 1) / 2


def passenger_call(row):
    pickup = row.get("pickup_type") or "0"
    dropoff = row.get("drop_off_type") or "0"
    if pickup == "1" and dropoff == "1":
        return None
    arrival = clock_minutes(row.get("arrival_time"))
    departure = clock_minutes(row.get("departure_time"))
    if departure is None:
        departure = arrival
    if arrival is None:
        arrival = departure
    return (row["stop_id"], arrival, departure, pickup == "1", dropoff == "1")


def collect_day(z, stops, active):
    if not active:
        return {}, defaultdict(list), {}
    trip_meta = {}
    by_route = defaultdict(list)
    for trip in read_rows(z, "trips"):
        if trip["service_id"] not in active:
            continue
        trip_meta[trip["trip_id"]] = trip
        by_route[trip["route_id"]].append(trip["trip_id"])
    calls = defaultdict(list)
    for row in read_rows(z, "stop_times"):
        if row["trip_id"] not in trip_meta:
            continue
        call = passenger_call(row)
        if call and call[0] in stops:
            calls[row["trip_id"]].append((int(row["stop_sequence"]), call))
    sequences = {}
    for trip_id, rows in calls.items():
        rows.sort()
        sequences[trip_id] = [call for _, call in rows]
    return trip_meta, by_route, sequences


def clipped_trip(calls, stops, focus_stop_ids):
    clipped = clip_calls(calls, stops)
    if not clipped:
        return None
    in_core = sum(1 for call in clipped if call[0] in focus_stop_ids)
    return clipped if in_core >= 2 else None


def attach_service(candidate, stops, sequence_calls, weekday_trips, saturday_trips, shape_id):
    sequence = [call[0] for call in sequence_calls]
    peak = daypart(weekday_trips, sequence, 6 * 60, 9 * 60)
    midday = daypart(weekday_trips, sequence, 10 * 60, 13 * 60)
    saturday = daypart(saturday_trips, sequence, 10 * 60, 13 * 60)
    chosen = peak or midday
    daily = max(1, len(weekday_trips))
    headway = chosen["headway"] if chosen else max(2, min(120, round(840 / daily)))
    times = (chosen or {}).get("times")
    candidate.update({
        "stopIds": [stops[sid]["id"] for sid in sequence],
        "dailyTrips": len(weekday_trips),
        "baseHeadway": headway,
        "headway": headway,
        "dayparts": {"peak": peak, "midday": midday, "saturday": saturday},
        "shapeId": shape_id,
    })
    no_board = [index for index, call in enumerate(sequence_calls) if call[3]]
    no_alight = [index for index, call in enumerate(sequence_calls) if call[4]]
    if no_board:
        candidate["noBoard"] = no_board
    if no_alight:
        candidate["noAlight"] = no_alight
    if not times:
        times = all_day_times(weekday_trips, sequence)
    if times:
        candidate["times"] = times
    return candidate


def load_source(source, path):
    with ZipFile(path) as z:
        wednesday = "20260923"
        saturday = first_saturday(z, wednesday)
        stops = {}
        for row in read_rows(z, "stops"):
            try:
                pos = [round(float(row["stop_lon"]), 7), round(float(row["stop_lat"]), 7)]
            except (KeyError, ValueError):
                continue
            stops[row["stop_id"]] = {
                "id": f"{source}:{row['stop_id']}",
                "name": row["stop_name"],
                "pos": pos,
                "city": city(row["stop_name"], pos),
            }
        focus_stop_ids = {sid for sid, value in stops.items() if focus_city(value["pos"])}
        routes = {row["route_id"]: row for row in read_rows(z, "routes")}
        trip_meta, by_route, sequences = collect_day(z, stops, active_services(z, wednesday))
        sat_meta, sat_by_route, sat_sequences = collect_day(z, stops, active_services(z, saturday) if saturday else set())
        has_direction = any((trip.get("direction_id") or "") != "" for trip in trip_meta.values())
        candidates = []

        def mode_of(route):
            return gtfs_mode(route.get("route_type"))

        if has_direction:
            for route_id, trip_ids in by_route.items():
                route = routes.get(route_id)
                mode = mode_of(route) if route else None
                if not mode:
                    continue
                valid = []
                for trip_id in trip_ids:
                    clipped = clipped_trip(sequences.get(trip_id, []), stops, focus_stop_ids)
                    if clipped:
                        in_core = sum(1 for call in clipped if call[0] in focus_stop_ids)
                        valid.append((trip_id, clipped, in_core))
                grouped = defaultdict(list)
                for item in valid:
                    grouped[trip_meta[item[0]].get("direction_id") or "0"].append(item)
                for direction, rows in grouped.items():
                    by_shape = defaultdict(list)
                    for item in rows:
                        by_shape[trip_meta[item[0]].get("shape_id") or ""].append(item)
                    shape_id, group = max(by_shape.items(), key=lambda item: (len(item[1]), max(row[2] for row in item[1])))
                    _trip_id, sequence_calls, _in_core = max(group, key=lambda item: item[2])
                    color, source_color = meaningful_color(route)
                    saturday_rows = []
                    for trip_id in sat_by_route.get(route_id, []):
                        if (sat_meta[trip_id].get("direction_id") or "0") != direction:
                            continue
                        clipped = clipped_trip(sat_sequences.get(trip_id, []), stops, focus_stop_ids)
                        if clipped:
                            saturday_rows.append(clipped)
                    candidate = {
                        "id": f"{source}:{route_id}:{direction}",
                        "source": source,
                        "name": route.get("route_short_name") or route_id,
                        "longName": route.get("route_long_name") or "",
                        "mode": mode,
                        "direction": direction,
                        **color,
                    }
                    if source_color:
                        candidate["sourceColor"] = source_color
                    candidates.append(attach_service(
                        candidate, stops, sequence_calls, [row[1] for row in rows], saturday_rows, shape_id
                    ))
        else:
            by_name = defaultdict(list)
            for route_id, trip_ids in by_route.items():
                route = routes.get(route_id)
                if route and mode_of(route):
                    by_name[route.get("route_short_name") or route_id].append(route_id)
            for short_name, route_ids in by_name.items():
                clusters = defaultdict(list)
                for route_id in route_ids:
                    for trip_id in by_route[route_id]:
                        clipped = clipped_trip(sequences.get(trip_id, []), stops, focus_stop_ids)
                        if not clipped:
                            continue
                        in_core = sum(1 for call in clipped if call[0] in focus_stop_ids)
                        clusters[(clipped[0][0], clipped[-1][0])].append((trip_id, clipped, in_core, route_id))
                kept = {key: rows for key, rows in clusters.items() if len(rows) >= 2}
                if not kept:
                    continue
                largest_key = max(kept, key=lambda key: len(kept[key]))
                largest_sequence = [call[0] for call in max(kept[largest_key], key=lambda item: item[2])[1]]
                used_ids = defaultdict(int)
                for key, rows in kept.items():
                    trip_id, sequence_calls, _in_core, route_id = max(rows, key=lambda item: item[2])
                    sequence = [call[0] for call in sequence_calls]
                    direction = "0" if key == largest_key or not is_reverse(sequence, largest_sequence) else "1"
                    slug = re.sub(r"[^a-z0-9]+", "", short_name.lower()) or "line"
                    used_ids[direction] += 1
                    suffix = "" if used_ids[direction] == 1 else f":{used_ids[direction]}"
                    route = routes[route_id]
                    color, source_color = meaningful_color(route)
                    saturday_rows = []
                    for sat_route_id in route_ids:
                        for sat_trip_id in sat_by_route.get(sat_route_id, []):
                            clipped = clipped_trip(sat_sequences.get(sat_trip_id, []), stops, focus_stop_ids)
                            if clipped and (clipped[0][0], clipped[-1][0]) == key:
                                saturday_rows.append(clipped)
                    candidate = {
                        "id": f"{source}:{slug}:{direction}{suffix}",
                        "source": source,
                        "name": short_name,
                        "longName": route.get("route_long_name") or "",
                        "mode": mode_of(route),
                        "direction": direction,
                        **color,
                    }
                    if source_color:
                        candidate["sourceColor"] = source_color
                    candidates.append(attach_service(
                        candidate, stops, sequence_calls, [row[1] for row in rows], saturday_rows, trip_meta[trip_id].get("shape_id") or ""
                    ))

        used_shape_ids = {route["shapeId"] for route in candidates if route.get("shapeId")}
        shapes = defaultdict(list)
        if used_shape_ids:
            for row in read_rows(z, "shapes"):
                if row["shape_id"] in used_shape_ids:
                    shapes[row["shape_id"]].append((
                        int(row["shape_pt_sequence"]),
                        [round(float(row["shape_pt_lon"]), 7), round(float(row["shape_pt_lat"]), 7)],
                    ))
        for route in candidates:
            shape = [pos for _, pos in sorted(shapes.get(route.pop("shapeId"), []))]
            route["geometry"] = clipped_shape(shape) if shape else []
            if not route["geometry"]:
                route["geometry"] = [[stops[sid.split(":", 1)[1]]["pos"] for sid in route["stopIds"]]]
        used_stops = {sid for route in candidates for sid in route["stopIds"]}
        output_stops = [stop for stop in stops.values() if stop["id"] in used_stops]
        return candidates, output_stops, {"wednesday": wednesday, "saturday": saturday}


def normalize_stop_name(name):
    text = name.casefold().replace("nż", " ")
    text = re.sub(r"\b(peron|platform|stanowisko)\s*\d+\b", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .")


def assign_areas(stops):
    parent = list(range(len(stops)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        left_root, right_root = find(left), find(right)
        if left_root == right_root:
            return
        if stops[left_root]["id"] < stops[right_root]["id"]:
            parent[right_root] = left_root
        else:
            parent[left_root] = right_root

    grouped = defaultdict(list)
    for index, stop in enumerate(stops):
        grouped[normalize_stop_name(stop["name"])].append(index)
    for indexes in grouped.values():
        for left in range(len(indexes)):
            for right in range(left + 1, len(indexes)):
                a, b = indexes[left], indexes[right]
                if km(stops[a]["pos"], stops[b]["pos"]) <= 0.25:
                    union(a, b)
    clusters = defaultdict(list)
    for index, stop in enumerate(stops):
        clusters[find(index)].append(stop)
    areas = []
    for members in clusters.values():
        area_id = "area:" + min(member["id"] for member in members)
        for member in members:
            member["area"] = area_id
        areas.append({
            "id": area_id,
            "name": min(members, key=lambda member: member["id"])["name"],
            "pos": [
                round(sum(member["pos"][0] for member in members) / len(members), 7),
                round(sum(member["pos"][1] for member in members) / len(members), 7),
            ],
            "stopIds": sorted(member["id"] for member in members),
        })
    areas.sort(key=lambda area: area["id"])
    return areas


def main():
    routes, stops, service_dates = [], [], {}
    for entry in CATALOG.values():
        if entry["id"] in {"gzm-ztm", "koleje-slaskie", "pkm-jaworzno"}:
            verify_source(entry)
    for source, path, _expected_hash in SOURCES:
        source_routes, source_stops, dates = load_source(source, path)
        routes.extend(source_routes)
        stops.extend(source_stops)
        service_dates[source] = dates
        print(source, len(source_routes), "patterns", len(source_stops), "stops", dates)
    pkm = json.loads(PKM_SNAPSHOT.read_text(encoding="utf-8"))
    for stop in pkm["stops"]:
        stop["city"] = city(stop["name"], stop["pos"])
    for route in pkm["routes"]:
        daily = max(1, round(840 / route["headway"]))
        route["dailyTrips"] = daily
        route["baseHeadway"] = route["headway"]
        route["dayparts"] = {
            "peak": {"headway": route["headway"], "trips": daily, "times": None},
            "midday": None,
            "saturday": None,
        }
    routes.extend(pkm["routes"])
    stops.extend(pkm["stops"])
    print("pkm", len(pkm["routes"]), "patterns", len(pkm["stops"]), "stops")
    technical = [stop["name"] for stop in stops if re.search(r"(?i)^granica|\[tech\]", stop["name"])]
    if technical:
        raise SystemExit("non-passenger stop remained in the network: " + technical[0])
    routes.sort(key=lambda r: ({"tram": 0, "rail": 1, "bus": 2}[r["mode"]], r["name"], r["direction"]))
    stops.sort(key=lambda s: s["id"])
    areas = assign_areas(stops)
    output = {
        "version": "2026-09-23-gzm-v5",
        "serviceDates": service_dates,
        "focus": [city["name"] for city in POPULATION["cities"]],
        "bbox": BBOX,
        "sources": [
            {"name": "GZM ZTM", "version": "schedule_ZTM_2026.09.23_11277_0005", "date": "2026-09-23", "license": "CC BY", "url": "https://otwartedane.metropoliagzm.pl/dataset/rozklady-jazdy-i-lokalizacja-przystankow-gtfs-wersja-rozszerzona", "sha256": SOURCES[0][2]},
            {"name": "Koleje Śląskie", "version": "2025-2026", "date": "2026-09-23 download", "license": "See source terms", "url": "https://koleje-ks.pl/gtfs/2025-2026.zip", "sha256": SOURCES[1][2]},
            {"name": "PKM Jaworzno", "version": "official public timetable snapshot", "date": "2026-09-26 retrieval", "license": "Source terms not stated; link to operator", "url": "https://www.pkm.jaworzno.pl/rozklady/start.php", "sha256": PKM_SHA256, "note": pkm["method"]},
        ],
        "routes": routes,
        "stops": stops,
        "areas": areas,
    }
    destination_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "gzm"
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / "network.json"
    compact = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    destination.write_text(compact, encoding="utf-8")
    print(destination, destination.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

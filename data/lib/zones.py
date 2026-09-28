"""Agglomerate populated 1 km cells into demand zones.

The merge is deterministic. A cell with at least 5,000 residents stays its own
zone. Other zones merge into the lowest-population same-municipality neighbour
until the zone count and the minimum size are both satisfied.
"""

import math
import re

LARGE_CELL = 5000
GRID = re.compile(r"N(-?\d+)E(-?\d+)")


def grid_key(cell_id):
    match = GRID.search(cell_id)
    if not match:
        raise ValueError(f"cell id has no 1 km grid key: {cell_id}")
    return int(match.group(1)), int(match.group(2))


def build_zones(cells, zone_target, min_zone_pop=1500):
    populated = []
    for index, cell in enumerate(cells):
        if float(cell.get("population") or 0) > 0:
            item = dict(cell)
            item["_index"] = index
            populated.append(item)
    by_muni = {}
    for index, cell in enumerate(populated):
        by_muni.setdefault(cell["city"], []).append(index)

    zones = []
    for cell in populated:
        north, east = grid_key(cell["id"])
        residents = float(cell["population"])
        zones.append({
            "cells": [cell],
            "residents": residents,
            "municipality": cell["city"],
            "min_id": cell["id"],
            "frozen": residents >= LARGE_CELL,
            "north": north,
            "east": east,
        })

    def refresh(zone):
        members = zone["cells"]
        residents = sum(float(cell["population"]) for cell in members)
        zone["residents"] = residents
        zone["min_id"] = min(cell["id"] for cell in members)
        zone["centroid"] = [
            sum(cell["lon"] * float(cell["population"]) for cell in members) / residents,
            sum(cell["lat"] * float(cell["population"]) for cell in members) / residents,
        ]
        zone["density"] = sum(float(cell["population"]) ** 2 for cell in members) / residents

    for zone in zones:
        refresh(zone)

    occupied = {}
    for index, zone in enumerate(zones):
        for cell in zone["cells"]:
            occupied[grid_key(cell["id"])] = index

    def neighbours(index):
        zone = zones[index]
        found = {}
        for cell in zone["cells"]:
            north, east = grid_key(cell["id"])
            for step in ((1000, 0), (-1000, 0), (0, 1000), (0, -1000)):
                other = occupied.get((north + step[0], east + step[1]))
                if other is None or other == index:
                    continue
                if zones[other]["municipality"] != zone["municipality"]:
                    continue
                found[other] = zones[other]
        return list(found)

    def nearest(index):
        zone = zones[index]
        best = None
        for other, candidate in enumerate(zones):
            if candidate is None or other == index or candidate["municipality"] != zone["municipality"]:
                continue
            distance = math.hypot(candidate["centroid"][0] - zone["centroid"][0], candidate["centroid"][1] - zone["centroid"][1])
            key = (distance, candidate["min_id"])
            if best is None or key < best[0]:
                best = (key, other)
        return None if best is None else best[1]

    muni_total = {}
    for zone in zones:
        muni_total[zone["municipality"]] = muni_total.get(zone["municipality"], 0) + zone["residents"]

    def absorb(host, guest):
        host["cells"].extend(guest["cells"])
        host["frozen"] = host["frozen"] or guest["frozen"]
        refresh(host)

    # A municipality smaller than the minimum stays one zone. Do not borrow cells.
    hosts = {}
    for index, zone in enumerate(zones):
        if muni_total[zone["municipality"]] >= min_zone_pop:
            continue
        current = hosts.get(zone["municipality"])
        if current is None or zone["min_id"] < zones[current]["min_id"]:
            hosts[zone["municipality"]] = index
    for index, zone in enumerate(list(zones)):
        if muni_total[zone["municipality"]] >= min_zone_pop:
            continue
        host = hosts[zone["municipality"]]
        if index == host:
            continue
        absorb(zones[host], zone)
        for cell in zone["cells"]:
            occupied[grid_key(cell["id"])] = host
        zones[index] = None

    guard = 0
    while True:
        guard += 1
        if guard > len(populated) + 5:
            raise RuntimeError("zone merge did not finish")
        active = [zone for zone in zones if zone is not None]
        small = [
            zone for zone in active
            if zone["residents"] < min_zone_pop and muni_total[zone["municipality"]] >= min_zone_pop and not zone["frozen"]
        ]
        if len(active) <= zone_target and not small:
            break
        victims = small if len(active) <= zone_target else [
            zone for zone in active if not zone["frozen"] and muni_total[zone["municipality"]] >= min_zone_pop
        ]
        if not victims:
            break
        victims.sort(key=lambda zone: (zone["residents"], zone["min_id"]))
        merged = False
        for victim in victims:
            index = zones.index(victim)
            adjacent = [zones[other] for other in neighbours(index)]
            open_adjacent = [zone for zone in adjacent if not zone["frozen"]]
            # A cell of 5,000 or more is not merged unless it is the only place left for a smaller zone.
            pool = open_adjacent or adjacent
            if not pool:
                other = nearest(index)
                if other is None:
                    continue
                pool = [zones[other]]
            host = min(pool, key=lambda zone: (zone["residents"], zone["min_id"]))
            absorb(host, victim)
            for cell in victim["cells"]:
                occupied[grid_key(cell["id"])] = zones.index(host)
            zones[index] = None
            merged = True
            break
        if not merged:
            break

    built = []
    for zone in zones:
        if zone is None:
            continue
        refresh(zone)
        built.append({
            "id": zone["min_id"],
            "municipality": zone["municipality"],
            "residents": round(zone["residents"]),
            "centroid": [round(zone["centroid"][0], 6), round(zone["centroid"][1], 6)],
            "density": round(zone["density"], 2),
            "cells": [
                {"index": cell["_index"], "lon": cell["lon"], "lat": cell["lat"], "population": cell["population"]}
                for cell in sorted(zone["cells"], key=lambda cell: cell["id"])
            ],
        })
    built.sort(key=lambda zone: zone["id"])
    return built


def _km(a_lon, a_lat, b_lon, b_lat):
    rad = math.pi / 180
    d_lat = (b_lat - a_lat) * rad
    d_lon = (b_lon - a_lon) * rad
    x = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * rad) * math.cos(b_lat * rad) * math.sin(d_lon / 2) ** 2
    return 12742 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


WALK_PER_KM = 1.25 / 4.5 * 60


def walk_minutes(zone, lon, lat, limit=None):
    """Population-weighted walk. Cells beyond `limit` minutes are left out.

    A rural zone can be several kilometres across. Averaging those distant cells
    into every stop would hide a stop that one member cell can actually reach.
    When every member cell is inside the limit, this is the mean over the zone.
    """
    weighted = 0.0
    weight = 0.0
    nearest = 1e9
    for cell in zone["cells"]:
        distance = _km(cell["lon"], cell["lat"], lon, lat)
        minutes = distance * WALK_PER_KM
        if minutes < nearest:
            nearest = minutes
        if limit is not None and minutes > limit:
            continue
        population = float(cell["population"])
        weighted += population * minutes
        weight += population
    if weight <= 0:
        return 1e9, nearest
    return weighted / weight, nearest


def attach_access(zones, stops, routes):
    """Published-stop access. Bus and tram use 15 min; rail and metro use 20."""
    rank_of = {"bus": 0, "tram": 1, "rail": 2, "metro": 3}
    limit_of = {"bus": 15, "tram": 15, "rail": 20, "metro": 20}
    stop_index = {stop["id"]: index for index, stop in enumerate(stops)}
    best_mode = {}
    for route in routes:
        mode = route.get("mode")
        rank = rank_of.get(mode)
        if rank is None:
            continue
        for stop_id in route.get("stopIds") or []:
            current = best_mode.get(stop_id)
            if current is None or rank > current[0]:
                best_mode[stop_id] = (rank, mode)
    indexed = []
    buckets = {}
    for stop_id, (rank, mode) in best_mode.items():
        index = stop_index.get(stop_id)
        if index is None:
            continue
        lon, lat = stops[index]["pos"]
        item = (index, lon, lat, mode)
        indexed.append(item)
        key = (math.floor(lon / 0.02), math.floor(lat / 0.02))
        buckets.setdefault(key, []).append(item)
    for zone in zones:
        lons = [cell["lon"] for cell in zone["cells"]]
        lats = [cell["lat"] for cell in zone["cells"]]
        seen = set()
        candidates = []
        x0 = math.floor((min(lons) - 0.025) / 0.02)
        x1 = math.floor((max(lons) + 0.025) / 0.02)
        y0 = math.floor((min(lats) - 0.025) / 0.02)
        y1 = math.floor((max(lats) + 0.025) / 0.02)
        for gx in range(x0, x1 + 1):
            for gy in range(y0, y1 + 1):
                for index, lon, lat, mode in buckets.get((gx, gy), ()):
                    if index in seen:
                        continue
                    seen.add(index)
                    minutes, nearest = walk_minutes(zone, lon, lat, limit_of[mode])
                    if nearest > limit_of[mode] or minutes > limit_of[mode]:
                        continue
                    candidates.append((minutes, index, mode))
        # Dense zones can walk to more than 16 stops. Keeping only 16 would drop
        # stops that sit within 1 km of a populated cell, so every stop inside the
        # walk limit is kept. The three best of each mode are inside that set.
        zone["access"] = [[index, round(minutes, 2)] for minutes, index, mode in candidates]
    return zones


def write_zones(path, zones):
    """Insert zones without rewriting the rest of the population file."""
    import json
    from pathlib import Path
    target = Path(path)
    raw = target.read_text(encoding="utf-8").rstrip()
    if not raw.endswith("}"):
        raise ValueError(f"{target} is not a single JSON object")
    marker = ',"zones":'
    if marker in raw:
        raw = raw[:raw.rindex(marker)] + "}"
        raw = raw.rstrip()
    payload = json.dumps(zones, ensure_ascii=False, separators=(",", ":"))
    target.write_text(raw[:-1] + marker + payload + "}\n", encoding="utf-8")

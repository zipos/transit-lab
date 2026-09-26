#!/usr/bin/env python3
"""Pin schematic PKM Jaworzno patterns from the operator's public timetable."""
import hashlib
import html
import json
import re
from datetime import date
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = "https://www.pkm.jaworzno.pl/rozklady/"


def fetch(path, params=None):
    url = urllib.parse.urljoin(BASE, path)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def weekday_departures(page):
    section = re.search(r'Dni robocze:</h2>(.*?)(?:</div></div>|<h2)', page, re.S)
    if not section:
        return 0
    return len(re.findall(r'>\d{2}:\d{2}</a>', section.group(1)))


def main_sequence(page, version, direction, markers, all_markers):
    """The map's marker dictionary appends variants, so use the timetable rows."""
    by_name = {html.unescape(entry["name"]).strip(): entry for entry in all_markers.values()}
    by_name.update({html.unescape(entry["name"]).strip(): entry for entry in markers.values()})
    sequence = []
    omitted = []
    board = None
    pattern = rf'href="(rozklad-{re.escape(version)}-\d+-{direction}\.html)"[^>]*>(.*?)</a>'
    for table in re.findall(r'<table class="route">(.*?)</table>', page, re.S):
        if not re.search(pattern, table):
            continue
        for row in re.findall(r'<tr>(.*?)</tr>', table, re.S):
            if re.search(r'wciecie-\d+', row):
                continue
            match = re.search(pattern, row, re.S)
            # Arrival-only termini have no timetable link, but retain a pole label.
            label = re.search(r'aria-label="(.*?), słupek ', row)
            if not match and not label:
                continue
            name = html.unescape(re.sub(r'<[^>]+>', '', match.group(2)) if match else label.group(1)).strip()
            if match:
                board = board or match.group(1)
            if name not in by_name:
                omitted.append(name)
                continue
            sequence.append(by_name[name])
    return sequence, board, omitted


def main():
    front = fetch("start.php")
    names = re.findall(r'href="linia-([A-Z0-9]+)\.html"', front)
    names = list(dict.fromkeys(names))
    map_page = fetch("mapa.html")
    marker_match = re.search(r'var markers_json = (\{.*?\});', map_page, re.S)
    if not marker_match:
        raise RuntimeError("Operator map no longer exposes stop coordinates")
    markers = json.loads(marker_match.group(1))
    stops = {}
    routes = []
    for name in names:
        page = fetch(f"linia-{name}.html")
        match = re.search(r'name="kat_route" value="([^"]+)"', page)
        if not match:
            raise RuntimeError(f"No schedule version for PKM {name}")
        version = match.group(1)
        for direction in (1, 2):
            data = json.loads(fetch("ajax.php", {"p": "get_direction", "kat": version, "kier": direction}))
            direction_markers = data.get("markers", {}) if isinstance(data, dict) and isinstance(data.get("markers"), dict) else {}
            sequence, first_board, omitted = main_sequence(page, version, direction, direction_markers, markers)
            if len(sequence) < 2:
                continue
            stop_ids = []
            for entry in sequence:
                sid = "pkm:" + str(entry["id_s"])
                marker = markers.get(str(entry["id_s"]), entry)
                pos = [round(float(marker["lng"]), 7), round(float(marker["lat"]), 7)]
                stops[sid] = {"id": sid, "name": html.unescape(entry["name"]), "pos": pos, "city": "Jaworzno"}
                stop_ids.append(sid)
            # The first published stop board gives a daytime weekday frequency proxy.
            board = fetch(first_board)
            departures = weekday_departures(board)
            headway = max(6, min(120, round(840 / departures))) if departures else 60
            coords = [stops[sid]["pos"] for sid in stop_ids]
            routes.append({
                "id": f"pkm:{name}:{direction}", "source": "pkm", "name": name,
                "longName": f"PKM Jaworzno · {stops[stop_ids[0]]['name']} → {stops[stop_ids[-1]]['name']}",
                "mode": "bus", "color": "#34795c", "stopIds": stop_ids,
                "geometry": [coords], "direction": str(direction - 1),
                "headway": headway, "estimatedGeometry": True, "estimatedHeadway": True,
                "scheduleVersion": version, "simplifiedBranches": True, "unmappedStops": omitted,
            })
        print(name, len([r for r in routes if r["name"] == name]), "directions", flush=True)
    if len(routes) < 30 or len(stops) < 150:
        raise RuntimeError(f"Incomplete PKM snapshot: {len(routes)} patterns, {len(stops)} stops")
    data = {"retrieved": date.today().isoformat(), "source": BASE + "start.php", "method": "Official main timetable stop sequences and route-map coordinates; indented branch rows and stops without published map coordinates are omitted. Geometry is straight between stops and headways are estimates from weekday first-stop departure count over 14 hours.", "routes": routes, "stops": sorted(stops.values(), key=lambda s: s["id"])}
    path = HERE / "sources" / f"pkm-jaworzno-{data['retrieved']}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(routes), "patterns", len(stops), "stops", hashlib.sha256(path.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()

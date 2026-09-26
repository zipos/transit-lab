"""Regression checks for official timetable rows and pinned PKM main patterns."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data"))
from import_pkm import main_sequence, weekday_departures

markers = {name: {"id_s": name, "name": name} for name in ["Start", "Middle", "End", "Branch"]}
page = '''<table class="route">
<tr><td><a href="rozklad-X-1-1.html">Start</a></td></tr>
<tr><td class="wciecie-1"><a href="rozklad-X-2-1.html">Branch</a></td></tr>
<tr><td><a href="rozklad-X-3-1.html">Middle</a></td></tr>
<tr><td><a aria-label="End, słupek 7 — live arrivals">7</a><b>End</b></td></tr>
</table><table class="route"><tr><td><a href="rozklad-X-1-2.html">End</a></td></tr></table>'''
sequence, board, omitted = main_sequence(page, "X", 1, markers, markers)
assert [entry["name"] for entry in sequence] == ["Start", "Middle", "End"]
assert board == "rozklad-X-1-1.html"
assert omitted == []
assert weekday_departures('Dni robocze:</h2><a>07:00</a><a>08:15</a></div></div><h2><a>09:00</a>') == 2

snapshot = json.loads((ROOT / "data/sources/pkm-jaworzno-2026-09-26.json").read_text())
stops = {stop["id"]: stop for stop in snapshot["stops"]}
route = next(route for route in snapshot["routes"] if route["name"] == "303" and route["direction"] == "0")
assert stops[route["stopIds"][-1]]["name"] == "Osiedle Stałe Cmentarz Pętla"
assert "Bory Hetmańska Pętla" not in [stops[sid]["name"] for sid in route["stopIds"]]
assert all(sid in stops for route in snapshot["routes"] for sid in route["stopIds"])
print("PKM importer regression checks passed")

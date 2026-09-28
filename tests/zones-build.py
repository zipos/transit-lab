"""Zone agglomeration is deterministic and keeps every resident."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from lib.zones import attach_access, build_zones

root = Path(__file__).resolve().parents[1]
population = json.loads((root / "data/gzm/population.json").read_text(encoding="utf-8"))
network = json.loads((root / "data/gzm/network.json").read_text(encoding="utf-8"))
first = build_zones(population["cells"], 450, 1500)
second = build_zones(population["cells"], 450, 1500)
attach_access(first, network["stops"], network["routes"])
attach_access(second, network["stops"], network["routes"])
assert first == second, "two zone builds differed"
assert len(first) == 450
assert sum(zone["residents"] for zone in first) == population["totalPopulation"]
assert min(zone["residents"] for zone in first) >= 1500
print("zone build deterministic", len(first))

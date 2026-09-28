#!/usr/bin/env python3
"""Build one region's processed snapshots from its manifest.

Population and templates are copied from the pinned processed files. The GTFS
importer is the same pipeline as data/import_gtfs.py, so route and stop counts
stay on the brief-02 snapshot unless a source file changes.
"""

import hashlib
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def sha256(path):
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 data/build_region.py <region-id>")
    region_id = sys.argv[1]
    region = json.loads((ROOT / "regions" / region_id / "region.json").read_text(encoding="utf-8"))
    if region["id"] != region_id:
        raise SystemExit("manifest id does not match the directory")
    output = HERE / region_id
    output.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(HERE))
    from import_gtfs import main as import_network
    sys.argv = ["import_gtfs.py", str(output)]
    import_network()
    population_dest = output / "population.json"
    if not population_dest.exists():
        raise SystemExit(f"missing {population_dest}; keep the pinned processed population file there")
    templates = ROOT / "regions" / region_id / "templates.json"
    network = json.loads((output / "network.json").read_text(encoding="utf-8"))
    population = json.loads(population_dest.read_text(encoding="utf-8"))
    from lib.zones import attach_access, build_zones, write_zones
    demand = region.get("demand") or {}
    zones = build_zones(population["cells"], int(demand.get("zoneTarget") or 450), int(demand.get("minZonePop") or 1500))
    attach_access(zones, network["stops"], network["routes"])
    write_zones(population_dest, zones)
    population["zones"] = zones
    lock = {
        "region": region_id,
        "networkVersion": network["version"],
        "network": {"sha256": sha256(output / "network.json"), "routes": len(network["routes"]), "stops": len(network["stops"])},
        "population": {"sha256": sha256(population_dest), "residents": population["totalPopulation"], "cities": len(population["cities"])},
        "templates": {"sha256": sha256(templates)},
    }
    (output / "manifest.lock.json").write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(lock["network"]), "residents", lock["population"]["residents"])


if __name__ == "__main__":
    main()

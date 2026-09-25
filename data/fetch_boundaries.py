#!/usr/bin/env python3
"""Pin the 41 GZM municipalities, Jaworzno and Orzesze from official PRG."""
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENDPOINT = "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query"
NAMES = (
    "Będzin", "Bieruń", "Bobrowniki", "Bojszowy", "Bytom", "Chełm Śląski",
    "Chorzów", "Czeladź", "Dąbrowa Górnicza", "Gierałtowice", "Gliwice",
    "Imielin", "Katowice", "Knurów", "Kobiór", "Lędziny", "Łaziska Górne",
    "Mierzęcice", "Mikołów", "Mysłowice", "Ożarowice", "Piekary Śląskie",
    "Pilchowice", "Psary", "Pyskowice", "Radzionków", "Ruda Śląska",
    "Rudziniec", "Siemianowice Śląskie", "Siewierz", "Sławków", "Sosnowiec",
    "Sośnicowice", "Świerklaniec", "Świętochłowice", "Tarnowskie Góry",
    "Tychy", "Wojkowice", "Wyry", "Zabrze", "Zbrosławice", "Jaworzno",
    "Orzesze",
)


def get(params):
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response), url


def main():
    listing, _ = get({"where": "teryt LIKE '24%'", "outFields": "id,teryt,nazwa", "returnGeometry": "false", "f": "json"})
    codes = {str(f["attributes"]["teryt"]): f["attributes"]["nazwa"] for f in listing["features"] if f["attributes"]["nazwa"] in NAMES}
    if sorted(codes.values()) != sorted(NAMES):
        raise RuntimeError(f"PRG name mismatch: missing {sorted(set(NAMES) - set(codes.values()))}")
    where = "teryt IN (" + ",".join("'" + code + "'" for code in sorted(codes)) + ")"
    data, url = get({"where": where, "outFields": "id,teryt,nazwa", "returnGeometry": "true", "outSR": "2180", "f": "geojson"})
    if {str(f["properties"]["teryt"]) for f in data["features"]} != set(codes):
        raise RuntimeError("PRG geometry response did not contain all 43 municipalities")
    data["features"].sort(key=lambda f: str(f["properties"]["teryt"]))
    path = HERE / "sources" / "city-boundaries-prg.geojson"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(data["features"]), "municipalities", path.stat().st_size, "bytes", hashlib.sha256(path.read_bytes()).hexdigest())
    print(url)


if __name__ == "__main__":
    main()

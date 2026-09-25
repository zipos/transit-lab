#!/usr/bin/env python3
"""Build a pinned GUS BDL municipal December wage-median snapshot."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "sources" / "bdl-municipal-income-response.json"
JSON_OUT = HERE / "municipal-income.json"
JS_OUT = HERE / "municipal-income.js"

SOURCE_SHA256 = "bbe0bbfa77844b2f1285ec7ea2d54908d39ddab97772bbbc276f863f7ed13103"
SUBJECT_ID = "P4610"
VARIABLE_ID = "1750207"
ATTRIBUTE_ID = "1"
YEARS = (2024, 2025)
EXPECTED_UNITS = {
    "2463011": ("Chorzów", "012414863011"),
    "2469011": ("Katowice", "012414869011"),
    "2470011": ("Mysłowice", "012414870011"),
    "2474011": ("Siemianowice Śląskie", "012414874011"),
    "2475011": ("Sosnowiec", "012415075011"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_data():
    if sha256(SOURCE) != SOURCE_SHA256:
        raise ValueError("The pinned GUS BDL source response has changed")
    snapshot = json.loads(SOURCE.read_text(encoding="utf-8"))
    subject = snapshot["subject"]["response"]["data"]
    variable = snapshot["variable"]["response"]["data"]
    attribute = snapshot["attribute"]["response"]["data"]

    if subject["id"] != SUBJECT_ID:
        raise ValueError("Unexpected BDL subject ID")
    if variable["id"] != VARIABLE_ID:
        raise ValueError("Unexpected BDL variable ID")
    variable_attributes = variable["attributes"]
    if (
        variable_attributes.get("subjectId") != SUBJECT_ID
        or variable_attributes.get("n1") != "grudzień"
        or variable_attributes.get("n2") != "wg miejsca zamieszkania"
        or variable_attributes.get("n3") != "ogółem"
        or variable_attributes.get("level") != 6
        or variable_attributes.get("measureUnitName") != "zł"
        or variable_attributes.get("years") != list(YEARS)
    ):
        raise ValueError("The BDL variable no longer matches the pinned series definition")
    if attribute["id"] != ATTRIBUTE_ID or attribute["attributes"].get("name") != "wartość":
        raise ValueError("Unexpected BDL data attribute")

    unit_entries = {entry["teryt"]: entry for entry in snapshot["units"]}
    data_entries = {entry["teryt"]: entry for entry in snapshot["data"]}
    if set(unit_entries) != set(EXPECTED_UNITS) or set(data_entries) != set(EXPECTED_UNITS):
        raise ValueError("The BDL snapshot must contain exactly the five requested municipalities")

    cities = []
    dataset_updates = set()
    for teryt, (name, unit_id) in EXPECTED_UNITS.items():
        unit_entry = unit_entries[teryt]
        data_entry = data_entries[teryt]
        unit = unit_entry["response"]["data"]
        response = data_entry["response"]
        unit_attributes = unit["attributes"]
        if unit_entry["unitId"] != unit_id or unit["id"] != unit_id:
            raise ValueError(f"Unexpected BDL unit ID for {name}")
        if unit_attributes.get("name") != name or unit_attributes.get("level") != 6:
            raise ValueError(f"Unexpected BDL unit name or level for {name}")
        if data_entry["unitId"] != unit_id or response["meta"].get("unitId") != unit_id:
            raise ValueError(f"BDL data response does not match the requested unit for {name}")
        if response["meta"].get("unitName") != name:
            raise ValueError(f"BDL data response has a different unit name for {name}")
        values = response.get("data", [])
        if len(values) != 1 or values[0]["id"] != VARIABLE_ID:
            raise ValueError(f"Missing median-wage response for {name}")
        rows = {int(item["year"]): item for item in values[0]["attributes"].get("values", [])}
        if set(rows) != set(YEARS):
            raise ValueError(f"The 2024 and 2025 values are not both present for {name}")
        if any(rows[year].get("attrId") != int(ATTRIBUTE_ID) for year in YEARS):
            raise ValueError(f"The BDL values have a nonstandard attribute for {name}")
        observations = []
        dataset_updates.add(values[0]["attributes"].get("lastUpdate"))
        for year in YEARS:
            value = rows[year].get("val")
            if not isinstance(value, (int, float)) or value <= 0:
                raise ValueError(f"Invalid BDL wage value for {name}, {year}")
            observations.append(
                {
                    "year": year,
                    "month": "December",
                    "medianGrossMonthlyPln": value,
                }
            )
        latest = observations[-1]
        cities.append(
            {
                "name": name,
                "teryt": teryt,
                "bdlUnitId": unit_id,
                "latest": latest,
                "observations": observations,
            }
        )
    if len(dataset_updates) != 1 or None in dataset_updates:
        raise ValueError("The five BDL city values do not share a consistent update timestamp")

    data = {
        "source": {
            "name": "Główny Urząd Statystyczny, Bank Danych Lokalnych",
            "datasetId": SUBJECT_ID,
            "datasetName": subject["attributes"]["name"],
            "variableId": VARIABLE_ID,
            "dimensions": {
                "month": "grudzień",
                "geography": "wg miejsca zamieszkania",
                "sex": "ogółem",
                "territorialLevel": "gmina",
            },
            "unit": "PLN per month, gross",
            "referenceMonth": "December",
            "years": list(YEARS),
            "latestCompleteYear": max(YEARS),
            "retrieved": snapshot["capturedAt"],
            "dataLastUpdated": next(iter(dataset_updates)),
            "apiMetadataModified": snapshot["variable"]["response"]["meta"]["modificationDate"],
            "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
            "url": "https://bdl.stat.gov.pl/bdl/dane/podgrup/temat/40/403/4610",
            "apiUrl": "https://bdl.stat.gov.pl/api/v1/data/by-unit/{bdlUnitId}?var-id=1750207&year=2024&year=2025&lang=pl",
            "snapshotFile": "sources/bdl-municipal-income-response.json",
            "snapshotSha256": SOURCE_SHA256,
        },
        "interpretation": {
            "description": subject["attributes"].get("description", ""),
            "scope": "Median monthly gross pay in December, grouped by municipality of residence, for the GUS distribution-of-wages study. The study covers people insured with ZUS through employment in national-economy entities; multiple employment relationships are counted separately.",
            "notWealth": "This is a labor-income proxy, not a measure of personal or household wealth, disposable income, rent, or assets.",
        },
        "cities": cities,
    }
    return data


def main():
    data = build_data()
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    JSON_OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    JS_OUT.write_text("window.GZM_MUNICIPAL_INCOME=" + compact + ";\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "cities": len(data["cities"]),
                "years": data["source"]["years"],
                "jsonBytes": JSON_OUT.stat().st_size,
                "jsBytes": JS_OUT.stat().st_size,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

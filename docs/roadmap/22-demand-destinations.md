# 22 · Demand v2: destinations (research spike first)

**Phase 2 · Size L · Depends on 21 · Review: yes · Starts with a written decision note; implementation only after the owner approves**

## Why

Destinations are currently a proxy built from residents, density and centrality. Real transit demand is pulled by jobs, universities, schools, hospitals and shopping, which cluster in city centres, business districts and campuses, not where people live. Without this, a metro to an office district looks no better than one to a housing estate.

## Part 1: spike (write `docs/decisions/22-destinations.md`, then stop)

Evaluate these candidate sources for GZM **and** Warsaw. For each one, give the URL, license or terms, spatial resolution, year, effort to import (tools, size), and what it would represent:

1. **GUS BDL employment by municipality** ("pracujący według miejsca pracy"). Find the exact BDL variable id. Check whether Warsaw's districts (dzielnice) have data, because Warsaw is one municipality.
2. **GUS commuting flows between municipalities** ("przepływy ludności związane z zatrudnieniem"). Check whether a 2021-based or the latest edition exists and in what form (an OD table by TERYT). This could be the best **calibration target** for flows between municipalities.
3. **OpenStreetMap** (Geofabrik Poland extract, ODbL):
   - Candidate attraction features: `office=*`, `shop=*`, `amenity=school|college|university|hospital|clinic`, `landuse=commercial|retail|industrial`, and building footprint area by `building=*` type.
   - Note ODbL's share-alike on derived databases and the required attribution.
   - Estimate the processing path: `osmium extract` by bbox, then a small Python script using `pyosmium` or `osmium export` to GeoJSONSeq.
   - A `requirements.txt` for the data build is acceptable. The runtime stays dependency-free.
4. **University students** (RAD-on / POL-on) by institution, for campus attraction.
5. **GUS 1 km buildings and dwellings grid (NSP 2021)**: does it separate non-residential floor area?

Recommend a combination, typically: municipality job totals from source 1, distributed within each municipality using weights from source 3, with students from source 4 and calibration against source 2. Include a small worked example: the top 10 GZM zones by the proposed work attraction, next to today's proxy.

**Stop and ask the owner to approve the decision note** before Part 2.

## Part 2: implementation (after approval)

- An offline pipeline in `data/lib/attractions.py`. It writes per-zone attractions `{ work, education, other }` into the zones data, and records every source in `data/sources.json` and `ATTRIBUTION.md`.
- Trip purposes in the model, with shares as manifest parameters documented in `docs/model-parameters.md` with sources:
  - home to work, destination weight `work`;
  - home to education, `education`;
  - home to other, `other` plus residents.
- **Distribution:**
  - Work trips are singly constrained to origins and scaled so that the attracted totals per municipality match the job totals.
  - Other purposes use the existing gravity form.
  - If source 2 is adopted, compare modeled flows between municipalities with the published matrix, and report correlation and the top 10 residuals in the PR.
- A new planning layer, "Destinations" (jobs and education), shown with the same 1 km or zone rendering as density.

## Acceptance checks

- The decision note is merged and approved first.
- After implementation, the top zones by work attraction include Katowice Śródmieście and the Gliwice centre (for GZM). A metro to the Katowice centre gains more than an equally long line between two residential estates; add this as an audit test.
- The download size stays under about 6 MB compressed per region.

## Stop and ask if

- Any source's license is unclear for public redistribution of the derived per-zone numbers.

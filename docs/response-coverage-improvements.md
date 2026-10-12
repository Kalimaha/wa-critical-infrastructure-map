# Response coverage — follow-up improvements

Baseline dense layer (`Police_Response_Coverage_m6.pmtiles`) stays as-is on `emergency-coverage` until a scheduled recompute. Checklist below tracks diagnosis and the R3 notebook/map fixes.

## Diagnose

- [x] Sample coastal/regional AOIs (R1 eight remote boxes + Perth land): cells that are **red with visible roads** vs **green/yellow/orange without roads** inside the hex.
- [x] Confirm whether red cells are `>15 min` travel vs truly unreachable (null / sentinel) — mostly reachable-but-slow (R1 AOI metrics).
- [x] Inspect nearest-road snap quality for centroids that land off-network — uncapped snap confirmed (R1/R2; notebook `assign_h3_cells` now caps at 5 km).
- [ ] Check whether Main Roads network omits local streets that would connect those cells.
- [ ] Review `NETWORK_TYPE` speed assumptions vs observed class mix in the AOI.

## Candidate product / model changes

- [x] Hide or separately style unreachable vs `>15 min` (notebook: `response_class=unreachable`; map dark-grey legend is the R3 map half).
- [ ] Optional land∩roads mask so hexes far from any edge are not painted as response time (snap-cap is the primary fix; mask remains optional).
- [x] Improve snap (max snap distance = `MAX_SAMPLE_DISTANCE_METRES` / 5 km in `assign_h3_cells`).
- [ ] Speed-table / network-class tuning after AOI evidence.
- [ ] Consider a denser or complementary street network if Main Roads sparsity drives false reds.

## Guardrails

- Do not overwrite the landed M6 S3 artifact unless a full recompute is intentionally scheduled.
- Keep UI layer label **Response coverage (WIP)** until the diagnosis above is closed.
- Do not run statewide / full-pilot recompute in R3; that is R4+.

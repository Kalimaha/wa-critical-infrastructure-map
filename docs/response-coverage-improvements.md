# Response coverage — follow-up improvements

The live map loads the R5 statewide archive (`Police_Response_Coverage_r5.pmtiles`). The older M6 baseline on S3 is left in place and is not overwritten by map deploys. Checklist below tracks diagnosis and the R3 notebook/map fixes.

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
- [x] Prefer **station-reachable** road when snapping (`assign_h3_cells` ignores orphaned Main Roads components; empty → `unreachable` if none within 5 km).
- [ ] Speed-table / network-class tuning after AOI evidence.
- [ ] Consider a denser or complementary street network if Main Roads sparsity drives false reds.

## Perth land-strict gate membership

For the locked Perth land AOI gate (centroid-in-bbox), **strict land membership** uses the same 5 km threshold as the snap cap:

1. Exclude water / west-coast fringe (no road within 5 km, or west of the road envelope) — see R4 water-mask notes.
2. Exclude cells with **no station-reachable road within 5 km** (orphaned Misc Road / Path islands that are not on a component any station can reach).

Those cells may still appear in a full rectangular AOI export as `unreachable`; they are **outside the strict Perth land gate** and do not count against a land-strict pass (target: 0 unreachable on the strict set). Notebook behaviour matches: snap only to station-reachable segments within 5 km.

## Guardrails

- Do not overwrite the landed M6 S3 artifact unless a full recompute is intentionally scheduled.
- UI layer label is **Response coverage**; layer stays off by default until the user enables it.
- Do not run statewide / full-pilot recompute in R3; that is R4+/R5. Perth AOI prefer-reachable gate recompute is local-only.

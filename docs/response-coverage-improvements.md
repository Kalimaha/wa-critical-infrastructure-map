# Response coverage — follow-up improvements

Baseline dense layer (`Police_Response_Coverage_m6.pmtiles`) stays as-is on `emergency-coverage`. This checklist is investigation-only until findings justify code changes.

## Diagnose

- [ ] Sample a coastal/regional AOI with ~3 police markers (user screenshot): cells that are **red with visible roads** vs **orange/red without roads inside the hex**.
- [ ] Confirm whether red cells are `>15 min` travel vs truly unreachable (null / sentinel).
- [ ] Inspect nearest-road snap quality for centroids that land off-network or across water/gaps.
- [ ] Check whether Main Roads network omits local streets that would connect those cells.
- [ ] Review `NETWORK_TYPE` speed assumptions vs observed class mix in the AOI.

## Candidate product / model changes

- [ ] Hide or separately style unreachable vs `>15 min` (today both paint red).
- [ ] Optional land� style unreachable vs `>15 min` (today both paint red).
- [ ] Optional land∩roads mask so hexes far from any edge are not painted as response time.
- [ ] Improve snap (max snap distance, prefer connected component with a station, etc.).
- [ ] Speed-table / network-class tuning after AOI evidence.
- [ ] Consider a denser or complementary street network if Main Roads sparsity drives false reds.

## Guardrails

- Do not overwrite the landed M6 S3 artifact unless a full recompute is intentionally scheduled.
- Keep UI layer label **Response coverage (WIP)** until the diagnosis above is closed.

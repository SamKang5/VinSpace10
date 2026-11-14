# Compatibility with VinSpaceTestingClone (old code)

This folder (E) has been adapted to the contracts of the old project without
modifying the original code:

- `route_compat.py` mirrors `src/lib/router.ts` (Mars 2000 great-circle metric,
  `RouteResult`-shaped output, shortest / terrain-aware modes). The original
  `route_algorithm.py` is unchanged and still passes `test_astar_samples.py`.
- `build_overlay_bins_compat.py` mirrors `scripts/build-overlay-bins.mjs`.
- `app/ui-demo/*.tsx` rewrites the demo components with prop interfaces matching
  `src/components/MapLegend.tsx`, `HowToModal.tsx` and `TerrainInfoPanel.tsx`,
  plus reusable loading/error/empty states.

Drop the `.tsx` files into the old project's `src/components/` (adjusting the
`../lib/overlay` import as needed) and import `route_compat` from Python
tooling.

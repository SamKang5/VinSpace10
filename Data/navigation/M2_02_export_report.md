# M2-02 export report

**PASS — research/demo use only.** M2-01 status: CONDITIONAL. The source rasters were read without modification and their SHA-256 hashes matched the D07 manifest.

- Grid: 267 × 267 = 71289 cells; north-up; 20 × 20 projected metres.
- Data-supported: 71289; unknown: 0; slope-policy blocked: 2907; finite supported costs: 68382.
- All blocked and unknown cells have null cost; all supported unblocked cells have finite friction ≥1.
- Each source raster's CRS, shape, transform and bounds were checked. Affine/bounds comparison uses absolute tolerance 1e-7 m, relative tolerance 0.
- Strict JSON encoding rejects NaN and Infinity. Reloaded JSON was compared cell-by-cell and in row-major order to the original float32 costs and masks. Float32-to-Python/JSON number round trip is exact: equality tolerance 0.
- Source input filenames, hashes, CRS, full affine, bounds, policy and upstream provenance are in `grid_metadata.json`. Original costs were copied, not recomputed.
- Automated unit tests and full-suite command are documented in README; tests include supported blocked versus unknown, rejected blocked finite cost and reordered cells.

**Limitations:** Independent image-to-DEM registration and exact DEM vertical datum remain unresolved. The slope threshold and friction model are unvalidated research assumptions; the export does not prove safe physical traversability or router integration.

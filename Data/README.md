# MARS NAVIGATOR navigation data

`navigation/` contains the M2-02 research/demo navigation export derived from the D07 Jezero Crater western-fan processing pipeline. The source products are a CTX orthomosaic and paired DEM; the export metadata records source names and SHA-256 hashes, the Mars CRS WKT, affine transform and original policy. M2-01 validation was conditional and M2-02 export checks passed. See `navigation/M2_02_export_report.md` and `navigation/README.md` for details and the TypeScript contract.

The grid has 267 columns by 267 rows (71,289 cells), with 20 m projected pixel spacing. The arrays are flat, row-major, with zero-based index `row * 267 + col`. Rows run north to south; columns run west to east. The CRS is Mars 2000 spherical equirectangular. Coordinates are projected easting and northing in metres, not WGS84. The affine is `[20, 0, 4582523.250853, 0, -20, 1095993.140188]` in `a,b,c,d,e,f` order; for a cell centre, apply the affine to `(col + 0.5, row + 0.5)`. Bounds and full WKT are in `navigation/grid_metadata.json`.

`validDataMask=1` means image/DEM support; `0` means unknown. `blockedMask=1` identifies data-supported cells blocked by the prototype slope policy; unknown cells have `blockedMask=0` but must also be excluded. Costs are dimensionless cell friction, with `null` for both blocked and unknown cells. The package has 71,289 supported cells, 2,907 policy-blocked cells, 68,382 finite costs and zero unknown cells. Consult the package README for the documented edge-cost rule and routing assumptions.

This is a research/demo dataset, not operational Mars navigation or a safety assessment. Image-to-DEM physical registration and the DEM vertical datum remain unresolved. Slope thresholds, hazard classes and friction are prototype assumptions and do not prove rover or astronaut traversability.

To verify the four package payloads, run a SHA-256 checker from the `navigation` directory against `checksums.sha256`; the checksum file does not hash itself. No raw rasters are included.

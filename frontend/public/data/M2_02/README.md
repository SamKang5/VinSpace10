# M2-02 navigation grid — research/demo only

No GIS software is required by the consumer. `navigation_grid.json` contains flat arrays in row-major order. Rows increase southward and columns eastward. Zero-based index `i = row * width + col`; require `0 <= row < height`, `0 <= col < width`. All arrays have `width * height` elements.

```ts
interface NavigationGrid {
  schemaVersion: "1.0";
  width: number; height: number;
  cost: (number | null)[];
  validDataMask: (0 | 1)[];
  blockedMask: (0 | 1)[];
}
```

`validDataMask=1` means image footprint and 3×3 DEM support according to D07, not safety. `0` means unknown. `blockedMask=1` means data-supported hazard class 3 (slope ≥15°); it is 0 for unknown as well as supported unblocked cells. Unknown (`validDataMask=0`) and blocked (`blockedMask=1`) must both be excluded from routing, and both have `cost=null`. A supported unblocked cell has finite `cost`: the source's dimensionless per-cell friction, not time, speed or an edge cost. Do not fill unknowns. Reject out-of-bounds or unavailable endpoints and neighbours.

For pixel centre `[row,col]`, use `x=a*(col+0.5)+b*(row+0.5)+c`, `y=d*(col+0.5)+e*(row+0.5)+f` with the affine in `grid_metadata.json`. Coordinates are Mars 2000 spherical equirectangular projected metres, not WGS84. Pixel spacing is 20 projected metres; east ground spacing varies with latitude.

The D07 A* policy excludes cost NoData, disallows diagonal corner cutting, and defines edge weight as spherical great-circle centre distance times the mean of endpoint frictions. Its admissible heuristic is great-circle distance to goal times minimum friction 1. This is a specification, not an implemented or tested router. See `grid_metadata.json` for source policy, CRS, hashes and provenance.

Physical image-to-DEM registration is unverified; DEM vertical datum is unresolved. Thresholds and friction are research assumptions and do not establish real terrain safety or traversability. Never use for operational Mars navigation.

Reproduce from the workspace (Python 3.10+, numpy and rasterio):
```powershell
python scripts/export_m2_02.py --data-dir D:\Nasa_Data\D07_Navigation_Pipeline --out-dir exports/M2_02
python -m unittest discover -s tests -v
```
`checksums.sha256` covers the other four package files, excluding itself. The export has no timestamps and is deterministic for the same inputs and Python numeric serialization.

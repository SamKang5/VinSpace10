# M2-03 — Coordinate contract

**PASS.** The M2-02 coordinate metadata and grid were checked against `D:\Nasa_Data\D07_Navigation_Pipeline\movement_cost.tif` (SHA-256 `290bfa605eb170c9380a3d638edca04be2b2ad0049dbdba23e892658437a8292`). M1 can use this contract for projected map clicks in the same Mars CRS, subject to the limitations below. Export data and costs were not changed.

## Grid and CRS

- 267 columns × 267 rows, 71,289 cells, north-up; row-major flat index `row * 267 + col`; valid integer indices are `0 <= row < 267`, `0 <= col < 267`.
- CRS: Mars 2000 sphere equirectangular, raster identifier `ESRI:103885`; full authoritative WKT is in `grid_metadata.json`. Sphere radius 3396190 m. Axis order in this contract is `(x, y)` = (easting, northing), in projected metres; `[row, col]` is the array order.
- Raster affine `(a,b,c,d,e,f)` = `[20.0, 0.0, 4582523.250853, 0.0, -20.0, 1095993.140188]`. These parameters map **pixel corners**: `x = a*col + b*row + c`, `y = d*col + e*row + f`. No rotation: `b=d=0`, `a=20`, `e=-20`. The negative Y step means row increases southward. Resolution is 20 × 20 **projected** metres, not a universal ground distance.
- Outer bounds `(xmin, ymin, xmax, ymax)` = `[4582523.250853, 1090653.140188, 4587863.250853, 1095993.140188]` in projected metres.

## Exact mapping and click rules

For an in-range integer `[row, col]`, the cell centre is:

```text
x = 4582523.250853 + 20 * (col + 0.5)
y = 1095993.140188 - 20 * (row + 0.5)
```

Given a finite projected click `(x, y)` in this CRS, first require **xmin ≤ x < xmax and ymin < y ≤ ymax**. Then calculate:

```text
col = floor((x - 4582523.250853) / 20)
row = floor((1095993.140188 - y) / 20)
i = row * 267 + col
```

Reject any non-finite or out-of-bounds coordinate; do not clamp. The west and north outer edges are included; east and south edges are excluded. An internal vertical edge belongs to the cell on its east, and an internal horizontal edge to the cell on its south. The boundary rule applies to the represented floating-point coordinates, without a snapping tolerance. Near an edge, upstream coordinate or rendering error can change the selected cell; decide any UI snapping policy separately. After selection, M1 must still reject unknown or blocked cells using the M2-02 masks and `null` costs.

## Representative centres

| Row | Col | Flat index | X / easting (m) | Y / northing (m) |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 4582533.250853 | 1095983.140188 |
| 0 | 266 | 266 | 4587853.250853 | 1095983.140188 |
| 266 | 0 | 71022 | 4582533.250853 | 1090663.140188 |
| 266 | 266 | 71288 | 4587853.250853 | 1090663.140188 |
| 133 | 133 | 35644 | 4585193.250853 | 1093323.140188 |
| 0 | 133 | 133 | 4585193.250853 | 1095983.140188 |
| 266 | 133 | 71155 | 4585193.250853 | 1090663.140188 |
| 133 | 0 | 35511 | 4582533.250853 | 1093323.140188 |
| 133 | 266 | 35777 | 4587853.250853 | 1093323.140188 |

## Verification

- The exported shape, layout, array lengths, CRS WKT, resolution, affine and bounds match the source raster. All 71,289 exported cost slots and their row-major positions were compared exactly against the raster values and mask.
- Nine representative centre coordinates (corners, middle, and edge middles) and 1,000 deterministically random index pairs (seed 203) were checked against rasterio cell centres, inverse mapping and rasterio's inverse. Maximum observed projected-coordinate difference: 0 m. Metadata and centre comparisons use absolute tolerance 1e-07 m, relative tolerance zero; index and exported float32 cost comparisons are exact. Random tests may include duplicate indices.
- Tested included west/north boundary, excluded east/south edges, an internal cell corner, a point 1e-6 m inside the southeast corner, outside points and non-finite coordinates. Membership uses exact comparisons, not the metadata tolerance.
- Reproduced using the validator in the data engineer's shared workspace with Python 3.10+, rasterio and the local D07 raster. The validator and source raster are not included in this review branch; consult the team data engineer to repeat the source-dependent check.

## Limitations

This is a projected-coordinate and array-index contract. It does not define a longitude/latitude conversion or map-library projection configuration. M1 must supply clicks already expressed in this exact Mars CRS and test its own display-to-projected-coordinate integration. Matching metadata does not prove physical image-to-DEM registration; the DEM vertical datum remains unresolved. This research/demo dataset does not establish safe or operational traversability.

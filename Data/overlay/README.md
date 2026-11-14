# MARS NAVIGATOR overlay data (M2-06)

Terrain rasters for the visualisation layers: the elevation tint and the
authoritative slope classes. Both are the D07 pipeline's own browser exports,
copied byte-for-byte from the NASA data archive
(`02_Processed_GIS/D07_Navigation_Pipeline/web/`), so they are the same bytes
the source pipeline produced.

| File | Bytes | Format | Meaning |
|---|---|---|---|
| `elevation.bin` | 285156 | Float32 LE, 71,289 cells | Elevation in metres, Mars 2000 sphere. Range -2552.6 to -2101.3. |
| `hazard.bin` | 71289 | Uint8, 71,289 cells | Slope class: 0 below 5 degrees, 1 from 5 to 10, 2 from 10 to 15, 3 at 15 degrees or above. |

`scripts/build-overlay-bins.mjs` copies these into `public/terrain` and writes
`public/terrain/overlay_metadata.json`, which carries the elevation range the
legend scales to and the class boundaries. The build fails if the rasters do
not match the grid or if the hazard classes disagree with the blocked mask.

## Layout

Row-major, north to south, index `i = row * 267 + col`. The arrays share the
navigation grid's geotransform and bounds:

```
geotransform : [4582523.250853, 20, 0, 1095993.140188, 0, -20]
bounds       : [4582523.250853, 1090653.140188, 4587863.250853, 1095993.140188]
```

So a cell in `hazard.bin` at index `i` is the same cell as `navigation_grid.json`
at index `i`, and the same cell as the CTX orthomosaic pixel block.

## Verified against the navigation export

- `hazard.bin` class 3 matches `blockedMask = 1` on all 71,289 cells.
- The class thresholds are the published ones: 0 is below 5 degrees, 1 is 5 to
  10, 2 is 10 to 15 and 3 is 15 or above. The published friction policy
  `movement_cost = 1 + (slope_degrees / 10)^2` reproduces the same classes on
  every non-blocked cell.

## Provenance

Copied from the NASA archive `VINSPACE10_NASA_DATA`, path
`02_Processed_GIS/D07_Navigation_Pipeline/web/{elevation,hazard}.bin.gz`,
gunzipped without modification. The D08 routing prototype
(`02_Processed_GIS/D08_AStar_Routing/public/data/`) holds byte-identical copies
of the same arrays, which confirms the values are the D07 originals.

SHA-256:

```
7e01f7c7062194767c6edfcb3d206dd48bede8739a6025a164ff8fbabb1477e9  elevation.bin
76c93854b52789c00f53c8e82b5ba74e86232600a91c11cb39cf5305061775c6  hazard.bin
```

## Limits

The slope classes are an illustrative research threshold, not a safety rating.
They do not establish that any cell is safe or traversable for a real rover.
Image-to-DEM physical registration and the DEM vertical datum remain
unresolved, so the slope and elevation values carry the same uncertainty as the
navigation grid itself.

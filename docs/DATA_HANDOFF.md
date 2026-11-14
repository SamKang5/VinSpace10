# MARS NAVIGATOR — M2-05 data handoff

**Handoff: complete for research/demo use; integration remains conditional.** The verified M2-02 navigation grid and M2-04 browser image are available as repository files. M1/M5 must serve them together, implement the display/click integration and validate the actual router before claiming an integrated demo. This is not an operational navigation or safety product.

## Deliverables and access

- Navigation package: [`Data/navigation/`](../Data/navigation/) — `navigation_grid.json`, `grid_metadata.json`, `README.md`, `M2_02_export_report.md`, and `checksums.sha256`. These were published on [data/m2-02-export](https://github.com/SamKang5/VinSpace10/tree/data/m2-02-export).
- Imagery package: [`Data/imagery/`](../Data/imagery/) — `mars_terrain.png`, `imagery_metadata.json`, `README.md`, `M2_04_validation_report.md`, and `checksums.sha256`. The PNG is a 531,304-byte, losslessly optimized, 1068 × 1068 grayscale + alpha image. It and its metadata must be served or bundled; a filesystem path is not automatically a browser URL.
- M2-04 reproduction: [`scripts/build_m2_04_imagery.py`](../scripts/build_m2_04_imagery.py) and [`tests/test_m2_04_imagery.py`](../tests/test_m2_04_imagery.py). Building requires the local D07/D08 inputs, GDAL Python bindings, NumPy and Pillow; **consuming the package requires no GIS software**. Each checksum manifest covers four payloads and excludes itself.
- Original CTX orthomosaic and D07 rasters remain local to the data engineer under `D:\Nasa_Data\`; their source names and hashes are in the package metadata. The optimized image is derived losslessly from the D08 display image, itself bilinearly resampled from the CTX source. Team members do not need the originals to consume the package.
- M2-03's independently checked coordinate contract is reproduced below. Its generated `reports/M2_03_coordinate_contract.md` is not in this checkout. The `scripts/validate_coordinate_contract.py` validator currently exists as staged workspace work on the M1 checkout, not on the published data branch; bring that validator through its owner's branch if the team needs to regenerate the standalone report. Its reported check compared nine representative and 1,000 seeded random centres to rasterio and checked every grid cost position against D07, with 0 m maximum observed centre discrepancy.

The M1 loader lives on the separate `m1-02-navigation-grid-loader` branch. The imagery/handoff branch is based on `data/m2-02-export`, so it does **not** contain that loader. Integrate the branches through the team's normal review process; neither branch needs to be merged automatically. The following frontend path examples apply after both branches' files are present.

## M1 and M5: load the data

The M1 branch contains `frontend/src/navigationGrid/index.ts` and browser copies of the navigation JSON at `frontend/public/data/M2_02/`. When that frontend is served with its public directory at `/`, load its validated model with:

```ts
import { fetchMarsNavigationGrid } from './navigationGrid/index.ts'; // adjust relative path to caller
const model = await fetchMarsNavigationGrid('/data/M2_02');
```

The existing loader validates the grid and metadata but does not load imagery or implement A*. Deploy/copy the **unchanged** `Data/imagery/mars_terrain.png` and `imagery_metadata.json` into an asset location served by the app (for example `frontend/public/data/M2_04/` in a later integration change). Then fetch `/data/M2_04/imagery_metadata.json` and display `/data/M2_04/mars_terrain.png` as an `<img>` or canvas image. These are proposed runtime URLs, not currently served assets. Handle non-OK fetches, invalid metadata and image decoding errors; verify the image, metadata and navigation package checksums before deployment. Do not refer to `D:\Nasa_Data` from browser code. Serving/copying the image and a working UI are outstanding integration tasks.

Use `model.getCell(row,col)` and `model.isTraversable(row,col)` after footprint and index checks. For raw JSON, `i = row * width + col`: require `validDataMask[i] === 1`, `blockedMask[i] === 0`, and a finite, non-null `cost[i]`. Reject invalid, out-of-bounds, blocked and unknown starts/ends; never turn `null` into zero or fill unknown terrain. M5 should draw the image and overlays against the same projected bounds and test pan, zoom and CSS scaling.

## Grid, CRS and coordinate contract

| Item | Verified contract |
|---|---|
| Grid | 267 columns × 267 rows = 71,289 cells; 20 × 20 projected metres; zero-based row-major, `i = row*267+col`. Rows increase south; columns increase east. |
| Masks | 71,289 supported (`validDataMask=1`), zero unknown, 2,907 supported policy-blocked (`blockedMask=1`), 68,382 finite-cost cells. Unknown is `validDataMask=0`; its blocked flag is 0. |
| Cost | Supported unblocked cells hold dimensionless per-cell friction ≥1. Blocked and unknown cells have `null` cost. Data support and policy thresholds do not establish safety. |
| CRS | Mars 2000 sphere equirectangular, radius 3,396,190 m; raster identifier `ESRI:103885`. Use the full WKT in `grid_metadata.json`; axis order is `(x,y)=(easting,northing)` in projected metres, not WGS84. |
| Grid affine | `[a,b,c,d,e,f] = [20,0,4582523.250853,0,-20,1095993.140188]`, mapping corner coordinates: `x=a*col+b*row+c`, `y=d*col+e*row+f`. |
| Outer bounds | `[xmin,ymin,xmax,ymax] = [4582523.250853,1090653.140188,4587863.250853,1095993.140188]` projected m. |

For cell `[row,col]`, its projected centre is:

```text
x = 4582523.250853 + 20*(col + 0.5)
y = 1095993.140188 - 20*(row + 0.5)
```

For a finite projected click in this CRS, first require **`xmin <= x < xmax` and `ymin < y <= ymax`**, then calculate `col=floor((x-xmin)/20)` and `row=floor((ymax-y)/20)`. West and north boundaries are inclusive; east and south are exclusive. Internal vertical and horizontal boundaries belong to the cell to the east and south, respectively. Reject outside points; never clamp. These are exact comparisons on represented floating-point coordinates; no snapping tolerance is applied. Validate availability after conversion. The current M1 `worldToCell` helper only checks its rounded result and may accept points just outside west/north; apply this explicit projected footprint guard before calling it. A separate UI snapping policy, if desired, must be defined and tested by the frontend team. No geographic longitude/latitude conversion is specified here.

## Image placement and route example

The M2-04 image uses the same CRS and outer bounds as the grid. Its pixel-corner affine is `[5,0,4582523.250853,0,-5,1095993.140188]` in `(a,b,c,d,e,f)` order: `x=a*pixelX+b*pixelY+c`, `y=d*pixelX+e*pixelY+f`. Image origin is the top-left corner; pixel x goes east and pixel y goes south. A 20 m grid cell covers 4 × 4 image pixels; its centre is at continuous corner-origin image coordinates `(4*col+2,4*row+2)`. These are continuous coordinates, not necessarily PNG pixel centres; 5 m is display spacing after resampling, not native observation resolution. Render the full image over the common bounds without flipping or stretching. Convert viewport/screen points through the actual pan, zoom and scaling into projected metres before applying the footprint rule.

| Endpoint | `[row,col]` | Flat index | Projected centre `(x,y)` m | Image `(pixelX,pixelY)` | Friction |
|---|---|---:|---|---|---:|
| Start | `[230,30]` | 61,440 | `(4583133.250853,1091383.140188)` | `(122,922)` | 1.6363859176635742 |
| End | `[35,235]` | 9,580 | `(4587233.250853,1095283.140188)` | `(942,142)` | 1.1645629405975342 |

Both endpoints are supported, unblocked and finite-cost. The prior D08 example route file, available locally at `D:\Nasa_Data\D08_AStar_Routing\examples\route_comparison.json`, has connected shortest and terrain-weighted paths; both were rechecked against M2-02 in the preceding handoff. Endpoint validity is not proof that a newly integrated router finds the same path.

## Routing policy and limitations

For adjacent permitted cells `u,v`, D07 specifies `edgeCost = sphericalGreatCircleDistance(center(u),center(v)) * (friction(u)+friction(v))/2`. The admissible heuristic is the great-circle distance from the current cell centre to the goal centre times minimum friction `1`. Exclude unsupported, blocked and NoData-cost cells. For a diagonal step, **both** orthogonal side-neighbour cells must be in bounds and traversable; do not cut a blocked or unknown corner. Detect disconnected regions and report no route. The image is a display background and must not be used to infer traversability.

The numerical coordinate match does not establish independent physical CTX-to-DEM registration. The DEM vertical datum remains unresolved; slope thresholds and friction are uncalibrated research assumptions. The DEM cannot resolve all small obstacles, terrain mechanics or dynamic hazards. Spherical distances are not 3D terrain-following distances. No physical astronaut/rover safety claim is supported.

## Verification

From the repository root, Python 3.10+ can verify both packages without GIS libraries:

```powershell
python -c "import hashlib; from pathlib import Path; roots=[Path('Data/navigation'),Path('Data/imagery')]; [(lambda p: [(_ for _ in ()).throw(AssertionError(n)) if hashlib.sha256((p/n).read_bytes()).hexdigest()!=h else print('PASS',p/n) for h,n in (line.split('  ',1) for line in (p/'checksums.sha256').read_text().splitlines())])(p) for p in roots]"
python -c "import json,hashlib; from pathlib import Path; p=Path('Data/navigation'); q=Path('Data/imagery'); g=json.loads((p/'navigation_grid.json').read_text()); n=json.loads((p/'grid_metadata.json').read_text()); m=json.loads((q/'imagery_metadata.json').read_text()); assert (g['width'],g['height'])==(267,267) and (m['width'],m['height'])==(1068,1068) and m['bounds']==n['bounds'] and m['crs']==n['crs'] and m['navigationGrid']['metadataSha256']==hashlib.sha256((p/'grid_metadata.json').read_bytes()).hexdigest(); assert all(g['validDataMask'][e['row']*267+e['col']]==1 and g['blockedMask'][e['row']*267+e['col']]==0 and g['cost'][e['row']*267+e['col']]==e['cost'] and e['imageCornerCoordinates']==[4*e['col']+2,4*e['row']+2] for e in m['routeEndpoints']); print('PASS grid/image metadata and endpoints')"
python -m unittest discover -s tests -p test_m2_04_imagery.py -v
```

Expected: eight `PASS` payload lines (four per package), `PASS grid/image metadata and endpoints`, and three imagery tests passing. M2-04 also checked the decoded image and alpha against D08 and a fresh source resample, all 7 representative grid/image centres and both endpoints, with 0 m maximum observed alignment discrepancy and `1e-7 m` absolute metadata tolerance. The full Python suite on the data engineer's checkout passed 13 tests; it requires NumPy and rasterio in addition to the focused test's standard library. For a source-dependent imagery rebuild use the command in the imagery README; it writes only the selected output directory.

## Remaining work for integration

- Make the imagery and metadata available at the selected frontend URLs; coordinate integration of the M1 loader branch and this data branch. Re-run checksum checks after copying.
- Enforce the projected footprint guard, then test screen clicks and image/grid overlay through real pan, zoom and CSS scaling. Test blocked, unknown, out-of-bounds and no-path behavior with the integrated router.
- Preserve the science limitations in the UI. Confirm team access to the merged/reviewed artifacts; local absolute paths are optional engineering references, not deployable assets.

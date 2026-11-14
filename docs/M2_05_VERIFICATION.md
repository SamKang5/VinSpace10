# M2-05 — Publication-fix verification

**Status: CONDITIONAL for team integration; data package checks PASS.** Verified on 2026-11-14 against the files in this isolated worktree and the existing M1 checkout. The local branch and commit are prepared for review; nothing was pushed or merged by this task.

## Integrity and contract

- M2-02 `Data/navigation/`: all four payload hashes in `checksums.sha256` pass; its five files and navigation costs were not modified. JSON parsed, 267 × 267 and 71,289 slots per array verified.
- M2-04 `Data/imagery/`: exactly five expected files; all four payload hashes pass. Manifest SHA-256 after the attribution update: `38edf3cec3583ef2cc2a90438b45f7f20eb40cb0b91d703e86174672ad2b3f3f`. PNG SHA-256 remains `72e3d023471aeaea8903b4109cca92cb6001b212700ef3dd81772aafe79785a0`; metadata SHA-256 remains `e102ad213ba0948cac46e654e59d65ccdf52640a47b26e61db722fbddf314032`. PNG decoded and verified as 1068 × 1068 grayscale + alpha. The checksum manifest does not hash itself.
- Strict JSON parsing passed for navigation grid, grid metadata and imagery metadata. Imagery and grid CRS and bounds match; image metadata pins the grid metadata SHA-256. Both documented endpoints agree with the actual M2-02 masks, friction and image coordinates.
- `.gitattributes` sets `-text` for `/Data/navigation/*`, `/Data/imagery/*`, and `/frontend/public/data/**` so checksummed bytes are not line-ending normalized. `git check-attr` confirmed `text: unset` for imagery files.
- Source-derived imagery builder ran into a separate temporary directory: PASS, 7 alignment points and 0 m maximum difference; all five regenerated outputs were byte-identical to this package using GDAL 3.13.3 and Pillow 12.3.0. Lossless pixel identity, rather than compressed byte reproducibility across encoder versions, is the durable expectation.

## Tests

- Shared workspace: `python -m unittest discover -s tests -v` — 13 passed, using Python 3.12, NumPy and rasterio. Isolated data worktree: three focused imagery tests passed.
- Existing M1 checkout, read-only: `npm test` — 53 passed using localhost access; `npm run typecheck` — passed. These validate the loader, not an integrated map UI or router.
- Python environment used `D:\bin\python.exe`, `PYTHONHOME=D:\apps\Python312`, `PYTHONPATH=D:\VinSpace10\.deps`. To recreate the data-check dependencies, use `python -m pip install numpy rasterio`; imagery rebuild additionally requires compatible GDAL Python bindings and Pillow. See `Data/imagery/README.md` for rebuild details.

## Attribution and remaining work

The USGS product record instructs “Please cite authors”; the older local XML lists use constraints None. The data-release citation has five creators, the local XML six originators and the product page a separate nine-author conference reference; these lists are not interchangeable. The independent review reports live DOI and product access on 2026-11-14 and publisher-hosted CTX/DTM re-download hashes matching `842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615` and `16a1aa66c3f48c1bca252795827db7b417876217aff0f5e1aff18027fab2327b`. No official publisher checksum manifest or separate license grant was found; the original retrieval date remains unverified. NASA/USGS endorsement is not implied.

The published navigation branch is `data/m2-02-export`; the published M1 loader branch `m1-02-navigation-grid-loader` points to `1903782d4203c41e34d4ba2f1de55f39f23313b2` and descends from the data branch. The M2-04/M2-05 review branch is published at the previously verified `6fce4da1a0cb5b6260f973cf7e5a80dd3a44af0e`; subsequent corrections are in this branch history. M1/M5 must serve the PNG and metadata, implement real viewport and click integration, test route rendering and no-path handling, and agree how the reviewed branches are shared. The standalone M2-03 report remains absent; the coordinate contract is in the handoff.

Independent physical CTX/DEM registration and the DEM vertical datum remain unresolved; slope and friction policies are research assumptions. Nothing in this package validates astronaut or rover safety or real-world traversability.

- M2-03 validator rerun from the existing shared-workspace script against this worktree's navigation package and D07, writing its report to a temporary directory: PASS, 9 representative and 1,000 random round trips, 0 m maximum difference, 71,289 cost slots.

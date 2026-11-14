# Publication inventory — MARS NAVIGATOR data

Status: **review branch published; M2-05 final sign-off pending**. This inventory describes verified material and remaining release decisions. The data and imagery are research/demo artifacts, not a safety or operational navigation product.

## A — Already published

- `data/m2-02-export`: the five `Data/navigation/` files, including navigation JSON, metadata and checksum manifest.
- `data/m2-04-imagery-handoff`: the navigation package plus all five `Data/imagery/` files, the data handoff and verification report, and the imagery builder and focused tests. The independently approved baseline commit is `7c0b1fd73ff817501dc2940f1edf68dc281737f8`.
- `m1-02-navigation-grid-loader`: the navigation loader; it does not provide an integrated imagery UI or A* router.

## B — Verified and ready for review

The M2-03 coordinate report in `docs/M2_03_coordinate_contract.md` was regenerated against the D07 cost raster and the published navigation grid: 71,289 cost positions and 1,009 sample centre round trips passed. The report is source-dependent; its validator is not included in this branch. Both package manifests passed four payload hashes each; the imagery and grid metadata match on CRS and bounds. The package provides no evidence that the actual frontend image overlay or router is integrated.

## C — Documentation corrections required before final sign-off

The independent M2-05 review identifies five open attribution findings. They have **not** been corrected by publication:

1. The README's local-XML `useconst=None` needs reconciliation with the independently observed live USGS product record, which says **“Please cite authors”**; preserve the discrepancy and cite authors.
2. Update the historical live-access failure wording to reflect the review's subsequent 2026-11-14 successful product/DOI access.
3. Correct the product title to the independently observed DOI title or explicitly label the source XML's literal title.
4. Reconcile the six local XML originators with the five DOI creators; avoid presenting the XML list as the definitive DOI citation.
5. Clarify that the review reports 2026-11-14 publisher-hosted CTX and DTM re-downloads matched local hashes, while no official published checksum manifest was found.

These observations are recorded in the independently authored local `reviews/M2_05_final_independent_review.md`. They require source-evidence verification and a separate documentation/rebuild/checksum update; the original retrieval date and separate license grant remain unverified. Also update `Data/README.md` to list the imagery package. Do not represent NASA/USGS as endorsing the prototype.

## D — Keep outside Git until a storage plan exists

Original CTX GeoTIFF and paired DEM, D07 GeoTIFFs and web binary derivatives, large D08 source/intermediate files, cached browser profiles, and unrelated NASA data remain in `D:\Nasa_Data\`. They are not needed to consume the two browser-ready packages; the checked-in metadata records provenance. Any separate hosting must retain source identifiers, hashes, access rules and scientific limitations.

## E — Exclude or review before publication

Untracked or staged work in the shared workspace belongs to concurrent agents and has not been included. Local temporary browser profiles, `__pycache__`, downloaded source copies, machine-specific scratch outputs, and unreviewed reports are excluded. The full independent review is local; publication requires a separate privacy and content review because it references local environments and other agents' work.

## Merge readiness

Review the imagery branch against its actual base `data/m2-02-export`; resolve the five attribution findings, regenerate and verify the imagery manifest if the README changes, and review license and retrieval-date evidence. Then coordinate integration of the navigation/data branches with the frontend and test asset serving, pan/zoom click mapping, blocked/unknown/out-of-bounds handling and routing. Numerical metadata alignment does not validate physical CTX-to-DEM registration; DEM vertical datum, prototype slope/friction assumptions and real-world safety remain unresolved.

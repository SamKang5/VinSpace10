/**
 * Pinned accepted digests for the MAIN asset pipeline — the trust anchor for
 * the startup verification in src/lib/data.ts.
 *
 * Verifying served bytes against the served asset manifest alone cannot
 * detect a payload+manifest replacement, so the digests below are pinned in
 * code. Three kinds of accepted reference are used, matching MAIN's pipeline:
 *
 * 1. `grid_metadata.json` — byte-identical to the accepted M2-02 package
 *    (Data/navigation/checksums.sha256, branch data/m2-02-export @ 5f2f642).
 * 2. `elevation.bin` / `hazard.bin` — byte-identical copies of the D07
 *    archive rasters (Data/overlay, branch data/m2-04-imagery-handoff).
 * 3. Build outputs of the deterministic MAIN build steps
 *    (scripts/build-grid-bin.mjs, build-overlay-bins.mjs, crop-ctx-aoi.mjs)
 *    whose accepted inputs are themselves pinned:
 *    - navigation_grid.bin is built from the accepted navigation_grid.json
 *      (accepted digest e7687e27…, Data/navigation/checksums.sha256) with
 *      fail-closed validation by src/lib/navigationGrid,
 *    - ctx-jezero-aoi.png / ctx-aoi-meta.json are cropped from the accepted
 *      CTX source (sha256 842b457a…, declared in ctx-aoi-meta.json and
 *      matching the M2-04 provenance).
 *
 * If the data team refreshes a package, the build re-runs and these pins are
 * updated in the same change; tests/acceptedAssets drift guard fails on a
 * stale pin instead of silently rendering unverified bytes.
 */

export const ACCEPTED_GRID_METADATA_SHA256 =
  'b2c69392590c84321f32866b025de4de4eb46b256e59f649e21722aa9e0dc3f6';

/** Accepted CTX source mosaic (declared provenance in ctx-aoi-meta.json). */
export const ACCEPTED_CTX_SOURCE_SHA256 =
  '842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615';

/**
 * Digests of the seven runtime files the app downloads from
 * `<base>/terrain/`. Every one is downloaded once and its exact bytes hashed
 * at startup; the served asset manifest must match this reference exactly.
 */
export const ACCEPTED_TERRAIN_ASSETS: Readonly<Record<string, string>> = {
  'navigation_grid.bin': '2346fd02d19c67051b27d3211a96786c10d907af896288cb2cea2d9386e3def8',
  'grid_metadata.json': ACCEPTED_GRID_METADATA_SHA256,
  'ctx-jezero-aoi.png': '38929d6ae052eff335659d792054de91989e50be23e62ad4d99853b9d26da2a2',
  'ctx-aoi-meta.json': 'a1edd6d432477acede1864df67f59a7f0fc3a03e08b7ddb8ce8060171627fcda',
  'elevation.bin': '7e01f7c7062194767c6edfcb3d206dd48bede8739a6025a164ff8fbabb1477e9',
  'hazard.bin': '76c93854b52789c00f53c8e82b5ba74e86232600a91c11cb39cf5305061775c6',
  'overlay_metadata.json': '1559ac80fc6aa92b0ce5b20fb52f2dc8b6549f7b8093e53ecc644947f80ccc8b',
};

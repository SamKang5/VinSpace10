/**
 * Pinned integrity reference for the accepted data packages.
 *
 * These digests are the published SHA-256 values of the packages this
 * frontend is contracted to serve, copied from the accepted branches:
 * - navigation package (M2_02): data/m2-02-export @ 5f2f642
 *   (now `Data/navigation/`, also committed at data/m2-04-imagery-handoff)
 * - imagery package (M2_04): data/m2-04-imagery-handoff @ e267f8c / f7c2eda
 *
 * WHY A PINNED REFERENCE: verifying served bytes against a served manifest
 * alone cannot detect an attacker (or a bad build) that replaces BOTH the
 * payload and the manifest — the hashes would agree and produce a misleading
 * PASS. The accepted digests below are the trusted anchor: at startup the
 * served manifest must match these entries exactly AND every served payload
 * must hash to them. If the data team publishes a new package, update these
 * constants and the `acceptedPackages` test suite together.
 *
 * Each manifest covers its package payloads and excludes itself, matching
 * the M2 export conventions.
 */

export interface AcceptedPackage {
  /** filename -> published SHA-256 of the exact payload bytes. */
  readonly manifestEntries: Readonly<Record<string, string>>;
}

export const ACCEPTED_NAVIGATION_PACKAGE: AcceptedPackage = {
  manifestEntries: {
    "navigation_grid.json": "e7687e2792ce90414597841a39c65b2a9550d13b963ec7ce95968076866f2067",
    "grid_metadata.json": "b2c69392590c84321f32866b025de4de4eb46b256e59f649e21722aa9e0dc3f6",
    "README.md": "053de0c5a0ae426c29b9172ae0625a0bd821d298ded300a55ad339911e941d73",
    "M2_02_export_report.md": "d641a92d0bdad0e9009d8d63a621c66a4a22292e7d198f1d141af3941f239fa4",
  },
};

export const ACCEPTED_IMAGERY_PACKAGE: AcceptedPackage = {
  manifestEntries: {
    "mars_terrain.png": "72e3d023471aeaea8903b4109cca92cb6001b212700ef3dd81772aafe79785a0",
    "imagery_metadata.json": "e102ad213ba0948cac46e654e59d65ccdf52640a47b26e61db722fbddf314032",
    "README.md": "d13bb14ea9f1e167494d82f8679a76eefeb653555444f4f9f454a5fc966bf7b8",
    "M2_04_validation_report.md": "918a43f789a1e37fe08ee5d463fd16e4465dd94916cd76c3abd1b8bba05423eb",
  },
};

/** Payloads that must exist and verify before the app may render. */
export const REQUIRED_NAVIGATION_FILES: readonly string[] = ["navigation_grid.json", "grid_metadata.json"];
export const REQUIRED_IMAGERY_FILES: readonly string[] = ["mars_terrain.png", "imagery_metadata.json"];

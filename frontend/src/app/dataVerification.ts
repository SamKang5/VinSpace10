/**
 * Fail-closed startup verification for the served data packages (M1-04).
 *
 * Every payload is fetched ONCE as bytes; the same bytes are hashed AND
 * parsed, so the grid model can never be built from content other than what
 * was verified (no separate fetches that could race or diverge).
 *
 * Verification layers, all of which must pass before the app renders:
 *
 * 1. Manifest validity: each package's served `checksums.sha256` must parse
 *    into strict `sha256  filename` entries and must EXACTLY match the
 *    pinned accepted manifest in `acceptedPackages.ts` — same file set, same
 *    digests. Replacing both a payload and its manifest therefore fails:
 *    the pinned reference is the trust anchor, not the served manifest.
 * 2. Payload integrity: ALL EIGHT manifest entries (both navigation JSON
 *    payloads, the imagery PNG + metadata, and all four documentation files)
 *    are downloaded and their actual bytes SHA-256 hashed against the
 *    accepted digests. Nothing is verified by manifest digest alone.
 * 3. Cross-link: the verified `grid_metadata.json` bytes must hash to the
 *    `navigationGrid.metadataSha256` declared inside the verified imagery
 *    metadata.
 * 4. Contract validation: the parsed grid/metadata/imagery go through the
 *    loader and `expectImageryMatchesGrid` exactly as before.
 *
 * The verified PNG bytes are returned to the caller: the app renders the
 * image from a Blob URL over THESE bytes and never re-fetches the original
 * URL, so the displayed pixels cannot differ from what was verified.
 *
 * Any failure throws `PackageVerificationError`; the app shows its error
 * state and must never render a map or an integrity PASS from unverified
 * data.
 */

import { loadMarsNavigationGrid, type NavigationGridModel } from "../navigationGrid/index.ts";
import {
  expectImageryMatchesGrid,
  parseImageryMetadata,
  type ImageryMetadata,
} from "./imagery.ts";
import {
  ACCEPTED_IMAGERY_PACKAGE,
  ACCEPTED_NAVIGATION_PACKAGE,
  REQUIRED_IMAGERY_FILES,
  REQUIRED_NAVIGATION_FILES,
  type AcceptedPackage,
} from "./acceptedPackages.ts";

export class PackageVerificationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Data package verification failed — refusing to render unverified data:\n  - ${issues.join("\n  - ")}`,
    );
    this.name = "PackageVerificationError";
    this.issues = [...issues];
  }
}

export interface PackageFileCheck {
  readonly label: string;
  readonly expectedSha256: string;
  readonly actualSha256: string | null;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PackageVerification {
  readonly ok: boolean;
  readonly checks: readonly PackageFileCheck[];
}

export interface VerifiedTerrainImage {
  /**
   * The EXACT PNG bytes that were SHA-256 verified against the accepted
   * package reference. The app must render the image from these bytes (a
   * Blob/object URL) and never re-fetch the original URL, whose response
   * could differ from what was verified.
   */
  readonly bytes: ArrayBuffer;
  readonly sha256: string;
  readonly mimeType: string;
}

export interface VerifiedPackages {
  readonly model: NavigationGridModel;
  readonly imagery: ImageryMetadata;
  readonly verification: PackageVerification;
  readonly terrainImage: VerifiedTerrainImage;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new PackageVerificationError([`${url} is unavailable (HTTP ${response.status})`]);
  }
  return response.arrayBuffer();
}

function decodeUtf8(bytes: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Parse a `checksums.sha256` payload into filename -> digest. Strict: blank
 * lines are ignored, anything else must be `^[0-9a-f]{64}\s+\S+$`; duplicate
 * filenames are rejected.
 */
export function parseChecksumManifest(text: string, label: string): Map<string, string> {
  const entries = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim().length === 0) {
      continue;
    }
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match === null) {
      throw new PackageVerificationError([
        `${label} line ${i + 1} is malformed (expected "sha256  filename"): ${JSON.stringify(line)}`,
      ]);
    }
    const filename = match[2] as string;
    if (entries.has(filename)) {
      throw new PackageVerificationError([`${label} lists "${filename}" more than once`]);
    }
    entries.set(filename, match[1] as string);
  }
  if (entries.size === 0) {
    throw new PackageVerificationError([`${label} contains no entries`]);
  }
  return entries;
}

/**
 * Compare a served manifest against the pinned accepted manifest: the file
 * set and every digest must be identical. This is what makes "replace the
 * payload and the manifest together" detectable — the served manifest is
 * never the trust anchor.
 */
function expectManifestMatchesAccepted(
  served: Map<string, string>,
  accepted: AcceptedPackage,
  label: string,
  issues: string[],
): void {
  const acceptedEntries = Object.entries(accepted.manifestEntries);
  for (const [filename, digest] of acceptedEntries) {
    const servedDigest = served.get(filename);
    if (servedDigest === undefined) {
      issues.push(`${label}: accepted file "${filename}" is missing from the served manifest`);
    } else if (servedDigest !== digest) {
      issues.push(
        `${label}: manifest digest for "${filename}" (${servedDigest}) does not match the accepted reference (${digest})`,
      );
    }
  }
  for (const filename of served.keys()) {
    if (!(filename in accepted.manifestEntries)) {
      issues.push(`${label}: served manifest lists unexpected file "${filename}"`);
    }
  }
}

/**
 * Load and verify both packages. Bytes are fetched once, hashed, compared
 * against the pinned accepted reference, and parsed from the same bytes.
 * An optional AbortSignal cancels in-flight fetches when a newer load
 * supersedes this attempt (efficiency only — callers must still apply their
 * own generation checks, which stay authoritative).
 */
export async function loadVerifiedPackages(
  navigationBase: string,
  imageryBase: string,
  options: { signal?: AbortSignal } = {},
): Promise<VerifiedPackages> {
  const signal = options.signal;
  const nav = navigationBase.replace(/\/$/, "");
  const img = imageryBase.replace(/\/$/, "");

  const issues: string[] = [];
  const checks: PackageFileCheck[] = [];

  // Wave 1: runtime assets + manifests. Each payload is fetched ONCE as
  // bytes; hashed bytes are the parsed bytes (no second fetch that could
  // diverge from what was verified).
  const [navGridBytes, navMetaBytes, navManifestText, imgMetaBytes, imgManifestText, pngBytes] =
    await Promise.all([
      fetchBytes(`${nav}/navigation_grid.json`, signal),
      fetchBytes(`${nav}/grid_metadata.json`, signal),
      fetchBytes(`${nav}/checksums.sha256`, signal).then((b) => decodeUtf8(b)),
      fetchBytes(`${img}/imagery_metadata.json`, signal),
      fetchBytes(`${img}/checksums.sha256`, signal).then((b) => decodeUtf8(b)),
      fetchBytes(`${img}/mars_terrain.png`, signal),
    ]);

  const [navGridHash, navMetaHash, imgMetaHash, pngHash] = await Promise.all([
    sha256Hex(navGridBytes),
    sha256Hex(navMetaBytes),
    sha256Hex(imgMetaBytes),
    sha256Hex(pngBytes),
  ]);

  // Layer 1: served manifests must exactly match the pinned accepted manifests.
  const navManifest = parseChecksumManifest(navManifestText, "M2_02/checksums.sha256");
  const imgManifest = parseChecksumManifest(imgManifestText, "M2_04/checksums.sha256");
  expectManifestMatchesAccepted(navManifest, ACCEPTED_NAVIGATION_PACKAGE, "M2_02", issues);
  expectManifestMatchesAccepted(imgManifest, ACCEPTED_IMAGERY_PACKAGE, "M2_04", issues);

  // Layer 2: EVERY manifest entry's bytes are downloaded and SHA-256 hashed
  // against the pinned accepted digests — runtime assets and documentation
  // alike. A manifest-only comparison is never counted as byte verification.
  const verifyPayload = (
    label: string,
    filename: string,
    accepted: AcceptedPackage,
    actualSha256: string,
  ): void => {
    const expected = accepted.manifestEntries[filename];
    if (expected === undefined) {
      throw new PackageVerificationError([`accepted reference does not pin "${filename}"`]);
    }
    const ok = actualSha256 === expected;
    checks.push({
      label,
      expectedSha256: expected,
      actualSha256,
      ok,
      detail: ok
        ? "bytes downloaded, SHA-256 hashed, matches accepted reference"
        : `checksum mismatch (expected accepted digest ${expected})`,
    });
    if (!ok) {
      issues.push(`${label}: served ${filename} bytes do not match the accepted package digest`);
    }
  };

  verifyPayload("runtime asset: navigation_grid.json", "navigation_grid.json", ACCEPTED_NAVIGATION_PACKAGE, navGridHash);
  verifyPayload("runtime asset: grid_metadata.json", "grid_metadata.json", ACCEPTED_NAVIGATION_PACKAGE, navMetaHash);
  verifyPayload("runtime asset: mars_terrain.png", "mars_terrain.png", ACCEPTED_IMAGERY_PACKAGE, pngHash);
  verifyPayload("runtime asset: imagery_metadata.json", "imagery_metadata.json", ACCEPTED_IMAGERY_PACKAGE, imgMetaHash);

  // Wave 2: the remaining (documentation) manifest entries — also downloaded
  // and byte-hashed so the 8/8 claim is literal.
  const [navReadmeBytes, navReportBytes, imgReadmeBytes, imgReportBytes] = await Promise.all([
    fetchBytes(`${nav}/README.md`, signal),
    fetchBytes(`${nav}/M2_02_export_report.md`, signal),
    fetchBytes(`${img}/README.md`, signal),
    fetchBytes(`${img}/M2_04_validation_report.md`, signal),
  ]);
  const [navReadmeHash, navReportHash, imgReadmeHash, imgReportHash] = await Promise.all([
    sha256Hex(navReadmeBytes),
    sha256Hex(navReportBytes),
    sha256Hex(imgReadmeBytes),
    sha256Hex(imgReportBytes),
  ]);
  verifyPayload("documentation: M2_02/README.md", "README.md", ACCEPTED_NAVIGATION_PACKAGE, navReadmeHash);
  verifyPayload("documentation: M2_02/M2_02_export_report.md", "M2_02_export_report.md", ACCEPTED_NAVIGATION_PACKAGE, navReportHash);
  verifyPayload("documentation: M2_04/README.md", "README.md", ACCEPTED_IMAGERY_PACKAGE, imgReadmeHash);
  verifyPayload("documentation: M2_04/M2_04_validation_report.md", "M2_04_validation_report.md", ACCEPTED_IMAGERY_PACKAGE, imgReportHash);

  if (issues.length > 0) {
    throw new PackageVerificationError(issues);
  }

  // Layer 3: parse ONLY the verified bytes (same bytes that were hashed).
  let rawGrid: unknown;
  let rawGridMeta: unknown;
  let rawImageryMeta: unknown;
  try {
    rawGrid = JSON.parse(decodeUtf8(navGridBytes));
  } catch (cause) {
    throw new PackageVerificationError([`verified navigation_grid.json bytes are not valid JSON: ${String(cause)}`]);
  }
  try {
    rawGridMeta = JSON.parse(decodeUtf8(navMetaBytes));
  } catch (cause) {
    throw new PackageVerificationError([`verified grid_metadata.json bytes are not valid JSON: ${String(cause)}`]);
  }
  try {
    rawImageryMeta = JSON.parse(decodeUtf8(imgMetaBytes));
  } catch (cause) {
    throw new PackageVerificationError([`verified imagery_metadata.json bytes are not valid JSON: ${String(cause)}`]);
  }

  // Layer 4: contract validation (loader + imagery-vs-grid cross-checks).
  const model = loadMarsNavigationGrid(rawGrid, rawGridMeta);
  const imagery = parseImageryMetadata(rawImageryMeta);
  expectImageryMatchesGrid(imagery, model);

  // Cross-link: verified grid metadata bytes must match what the verified
  // imagery metadata declares.
  if (imagery.navigationGrid.metadataSha256 !== navMetaHash) {
    throw new PackageVerificationError([
      `navigationGrid.metadataSha256 (${imagery.navigationGrid.metadataSha256}) does not match the verified ` +
        `grid_metadata.json bytes (${navMetaHash})`,
    ]);
  }

  return {
    model,
    imagery,
    verification: { ok: true, checks },
    terrainImage: { bytes: pngBytes, sha256: pngHash, mimeType: "image/png" },
  };
}

// REQUIRED_*_FILES are re-exported for consumers that need the contract list.
export { REQUIRED_IMAGERY_FILES, REQUIRED_NAVIGATION_FILES };

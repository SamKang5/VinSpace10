/**
 * Validator for `grid_metadata.json` (M2-02 export, schemaVersion "1.0").
 *
 * Strict on everything the loader and helpers depend on: schema version,
 * dimensions, row-major layout declaration, CRS identity, the full affine
 * (a,b,c,d,e,f), projected bounds, resolution, and the statistics block that
 * is cross-checked against the grid arrays by the model. Provenance blocks
 * (sourceFiles, sourceProvenance, sourcePolicy, limitations) are shape-checked
 * lightly; they are documentation, not load-time contracts.
 *
 * The affine here maps pixel CORNERS: x = a*col + b*row + c, y = d*col + e*row + f.
 * Pixel-centre conversion (per the export README) adds 0.5 to col and row and
 * is implemented in coordinates.ts. Bounds are Mars 2000 spherical
 * equirectangular projected metres, not WGS84 lon/lat.
 */

import { NavigationGridValidationError } from "./errors.ts";
import type { GridAffine, GridCrs, GridMetadata, GridSourceFile, GridStatistics } from "./types.ts";

const METADATA_KEYS: readonly string[] = [
  "schemaVersion",
  "width",
  "height",
  "layout",
  "crs",
  "affine",
  "bounds",
  "resolutionProjectedMeters",
  "statistics",
  "sourceFiles",
  "sourceManifestSha256",
  "sourceProvenance",
  "sourcePolicy",
  "limitations",
];

const MAX_REPORTED_ISSUES = 10;

class IssueCollector {
  readonly issues: string[] = [];
  total = 0;

  add(message: string): void {
    this.total += 1;
    if (this.issues.length < MAX_REPORTED_ISSUES) {
      this.issues.push(message);
    }
  }

  throwIfAny(): void {
    if (this.total > 0) {
      throw new NavigationGridValidationError(this.issues, this.issues.length, this.total);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectNumber(value: unknown, label: string, issues: IssueCollector): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.add(`${label} must be a finite number, got ${JSON.stringify(value)}`);
    return Number.NaN;
  }
  return value;
}

function expectPositiveNumber(value: unknown, label: string, issues: IssueCollector): number {
  const n = expectNumber(value, label, issues);
  if (Number.isFinite(n) && n <= 0) {
    issues.add(`${label} must be > 0, got ${n}`);
  }
  return n;
}

function expectPositiveInteger(
  obj: Record<string, unknown>,
  key: string,
  issues: IssueCollector,
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.add(`${key} must be an integer >= 1, got ${JSON.stringify(value)}`);
    return 0;
  }
  return value;
}

function expectNonEmptyString(obj: Record<string, unknown>, key: string, label: string, issues: IssueCollector): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.add(`${label} must be a non-empty string, got ${JSON.stringify(value)}`);
    return "";
  }
  return value;
}

function expectFiniteNumberArray(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  length: number,
  issues: IssueCollector,
): number[] {
  const value = obj[key];
  if (!Array.isArray(value) || value.length !== length) {
    issues.add(`${label} must be an array of exactly ${length} finite numbers`);
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    out.push(expectNumber(value[i], `${label}[${i}]`, issues));
  }
  return out;
}

function parseCrs(raw: unknown, issues: IssueCollector): GridCrs {
  if (!isPlainObject(raw)) {
    issues.add("crs must be an object");
    return { name: "", wkt: "", radiusMeters: Number.NaN };
  }
  const name = expectNonEmptyString(raw, "name", "crs.name", issues);
  const wkt = expectNonEmptyString(raw, "wkt", "crs.wkt", issues);
  const radiusMeters = expectPositiveNumber(raw["radiusMeters"], "crs.radiusMeters", issues);
  return { name, wkt, radiusMeters };
}

function parseAffine(raw: unknown, issues: IssueCollector): GridAffine {
  if (!isPlainObject(raw)) {
    issues.add("affine must be an object");
    return { order: "a,b,c,d,e,f", values: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN], maps: "" };
  }
  const order = raw["order"];
  if (order !== "a,b,c,d,e,f") {
    issues.add(`affine.order must be "a,b,c,d,e,f", got ${JSON.stringify(order)}`);
  }
  const maps = expectNonEmptyString(raw, "maps", "affine.maps", issues);
  const values = expectFiniteNumberArray(raw, "values", "affine.values", 6, issues);
  return {
    order: "a,b,c,d,e,f",
    values: [values[0] ?? Number.NaN, values[1] ?? Number.NaN, values[2] ?? Number.NaN, values[3] ?? Number.NaN, values[4] ?? Number.NaN, values[5] ?? Number.NaN],
    maps,
  };
}

function parseStatistics(raw: unknown, issues: IssueCollector): GridStatistics {
  if (!isPlainObject(raw)) {
    issues.add("statistics must be an object");
    return { total: 0, supported: 0, unknown: 0, blocked: 0, finiteCost: 0 };
  }
  const fields = ["total", "supported", "unknown", "blocked", "finiteCost"] as const;
  const values: Record<(typeof fields)[number], number> = {
    total: 0,
    supported: 0,
    unknown: 0,
    blocked: 0,
    finiteCost: 0,
  };
  for (const field of fields) {
    const value = raw[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      issues.add(`statistics.${field} must be a non-negative integer, got ${JSON.stringify(value)}`);
    } else {
      values[field] = value;
    }
  }
  if (values.supported + values.unknown !== values.total && values.total > 0) {
    issues.add(
      `statistics.supported (${values.supported}) + statistics.unknown (${values.unknown}) must equal statistics.total (${values.total})`,
    );
  }
  return values;
}

function parseSourceFiles(raw: unknown, issues: IssueCollector): Record<string, GridSourceFile> {
  const out: Record<string, GridSourceFile> = {};
  if (!isPlainObject(raw)) {
    issues.add("sourceFiles must be an object keyed by layer");
    return out;
  }
  for (const [layer, entry] of Object.entries(raw)) {
    if (!isPlainObject(entry)) {
      issues.add(`sourceFiles.${layer} must be an object`);
      continue;
    }
    const filename = entry["filename"];
    const sha256 = entry["sha256"];
    const nodata = entry["nodata"];
    if (typeof filename !== "string" || filename.length === 0) {
      issues.add(`sourceFiles.${layer}.filename must be a non-empty string`);
    }
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      issues.add(`sourceFiles.${layer}.sha256 must be a 64-char lowercase hex digest`);
    }
    if (typeof nodata !== "number" || !Number.isFinite(nodata)) {
      issues.add(`sourceFiles.${layer}.nodata must be a finite number`);
    }
    out[layer] = { filename: String(filename), sha256: String(sha256), nodata: Number(nodata) };
  }
  return out;
}

function parseSourceProvenance(raw: unknown, issues: IssueCollector): Record<string, { sha256: string }> {
  const out: Record<string, { sha256: string }> = {};
  if (!isPlainObject(raw)) {
    issues.add("sourceProvenance must be an object keyed by source path");
    return out;
  }
  for (const [source, entry] of Object.entries(raw)) {
    const sha256 = isPlainObject(entry) ? entry["sha256"] : undefined;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      issues.add(`sourceProvenance["${source}"].sha256 must be a 64-char lowercase hex digest`);
    } else {
      out[source] = { sha256 };
    }
  }
  return out;
}

function parseSourcePolicy(raw: unknown, issues: IssueCollector): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(raw)) {
    issues.add("sourcePolicy must be an object of string policies");
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      issues.add(`sourcePolicy.${key} must be a string`);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function parseLimitations(raw: unknown, issues: IssueCollector): string[] {
  if (!Array.isArray(raw)) {
    issues.add("limitations must be an array of strings");
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i];
    if (typeof value !== "string") {
      issues.add(`limitations[${i}] must be a string`);
    } else {
      out.push(value);
    }
  }
  return out;
}

/** Parse and validate a raw `grid_metadata.json` payload. */
export function parseGridMetadata(raw: unknown): GridMetadata {
  const issues = new IssueCollector();

  if (!isPlainObject(raw)) {
    throw new NavigationGridValidationError(
      [`expected a JSON object, got ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}`],
      1,
      1,
    );
  }

  for (const key of Object.keys(raw)) {
    if (!METADATA_KEYS.includes(key)) {
      issues.add(`unexpected top-level key "${key}" (schema drift guard)`);
    }
  }

  if (raw["schemaVersion"] !== "1.0") {
    issues.add(`schemaVersion must be the string "1.0", got ${JSON.stringify(raw["schemaVersion"])}`);
  }

  const width = expectPositiveInteger(raw, "width", issues);
  const height = expectPositiveInteger(raw, "height", issues);

  if (raw["layout"] !== "row-major") {
    issues.add(`layout must be "row-major", got ${JSON.stringify(raw["layout"])}`);
  }

  const crs = parseCrs(raw["crs"], issues);
  const affine = parseAffine(raw["affine"], issues);

  const bounds = expectFiniteNumberArray(raw, "bounds", "bounds", 4, issues);
  if (bounds.length === 4 && Number.isFinite(bounds[0]) && Number.isFinite(bounds[2])) {
    const [west, south, east, north] = bounds as [number, number, number, number];
    if (west > east) {
      issues.add(`bounds west (${west}) must be <= east (${east})`);
    }
    if (south > north) {
      issues.add(`bounds south (${south}) must be <= north (${north})`);
    }
  }

  const resolution = expectFiniteNumberArray(raw, "resolutionProjectedMeters", "resolutionProjectedMeters", 2, issues);
  for (let i = 0; i < resolution.length; i += 1) {
    const value = resolution[i] as number;
    if (Number.isFinite(value) && value <= 0) {
      issues.add(`resolutionProjectedMeters[${i}] must be > 0, got ${value}`);
    }
  }

  const statistics = parseStatistics(raw["statistics"], issues);
  const sourceFiles = parseSourceFiles(raw["sourceFiles"], issues);
  const sourceProvenance = parseSourceProvenance(raw["sourceProvenance"], issues);
  const sourcePolicy = parseSourcePolicy(raw["sourcePolicy"], issues);
  const limitations = parseLimitations(raw["limitations"], issues);

  const sourceManifestSha256 = raw["sourceManifestSha256"];
  if (typeof sourceManifestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceManifestSha256)) {
    issues.add("sourceManifestSha256 must be a 64-char lowercase hex digest");
  }

  issues.throwIfAny();

  return {
    schemaVersion: "1.0",
    width,
    height,
    layout: "row-major",
    crs,
    affine,
    bounds: bounds as [number, number, number, number],
    resolutionProjectedMeters: resolution as [number, number],
    statistics,
    sourceFiles,
    sourceManifestSha256: String(sourceManifestSha256),
    sourceProvenance,
    sourcePolicy,
    limitations,
  };
}

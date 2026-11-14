/**
 * Imagery metadata loader for the M2-04 browser terrain package
 * (`public/data/M2_04/`, copied unchanged from the accepted
 * `data/m2-04-imagery-handoff` branch).
 *
 * The PNG is NOT georeferenced: all placement math comes from
 * `imagery_metadata.json`, which shares the grid's outer bounds, CRS and
 * corner-origin affine convention. Pixel spacing is 5 projected metres, so a
 * 20 m grid cell spans 4 x 4 image pixels; the cell centre of [row, col] is
 * the continuous image point (4*col + 2, 4*row + 2).
 *
 * RESEARCH/DEMO DATA — NOT FOR OPERATIONAL MARS NAVIGATION. Numerical
 * image/grid alignment does not verify physical CTX-to-DEM registration.
 */

import type { GridAffine, GridCrs } from "../navigationGrid/types.ts";
import type { NavigationGridModel } from "../navigationGrid/navigationGridModel.ts";

/** Same absolute tolerance (metres) as the loader's cross-checks. */
const METRIC_TOLERANCE = 1e-6;

export interface ImageryAffine extends GridAffine {
  /** "continuous pixel-corner coordinates" in the M2-04 export. */
  readonly coordinates: string;
}

export interface ImageryRouteEndpoint {
  readonly row: number;
  readonly col: number;
  /** Continuous pixel-corner coordinates of the cell centre: (4*col+2, 4*row+2). */
  readonly imageCornerCoordinates: readonly [number, number];
  readonly projectedCoordinates: readonly [number, number];
  readonly cost: number;
}

export interface ImageryMetadata {
  readonly schemaVersion: "1.0";
  readonly image: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: string;
  readonly imageOrigin: string;
  readonly crs: GridCrs;
  readonly affine: ImageryAffine;
  readonly bounds: readonly [number, number, number, number];
  readonly resolutionProjectedMeters: readonly [number, number];
  readonly navigationGrid: {
    readonly width: number;
    readonly height: number;
    readonly pixelsPerCell: readonly [number, number];
    readonly cellCenterToImage: string;
    readonly metadataSha256: string;
  };
  readonly source: {
    readonly description: string;
    readonly d08ImageSha256: string;
    readonly ctxSourceFilename: string;
    readonly ctxSourceSha256: string;
  };
  readonly routeEndpoints: readonly ImageryRouteEndpoint[];
  readonly limitations: readonly string[];
}

export class ImageryValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`imagery_metadata.json failed validation:\n  - ${issues.join("\n  - ")}`);
    this.name = "ImageryValidationError";
    this.issues = [...issues];
  }
}

const METADATA_KEYS: readonly string[] = [
  "schemaVersion",
  "image",
  "mimeType",
  "width",
  "height",
  "pixelFormat",
  "imageOrigin",
  "crs",
  "affine",
  "bounds",
  "resolutionProjectedMeters",
  "navigationGrid",
  "source",
  "routeEndpoints",
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
      throw new ImageryValidationError(this.issues);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectFiniteNumber(value: unknown, label: string, issues: IssueCollector): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.add(`${label} must be a finite number, got ${JSON.stringify(value)}`);
    return Number.NaN;
  }
  return value;
}

function expectPositiveInteger(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  issues: IssueCollector,
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.add(`${label} must be an integer >= 1, got ${JSON.stringify(value)}`);
    return 0;
  }
  return value;
}

function expectNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  issues: IssueCollector,
): string {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.add(`${label} must be a non-empty string, got ${JSON.stringify(value)}`);
    return "";
  }
  return value;
}

function expectHex64(value: unknown, label: string, issues: IssueCollector): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    issues.add(`${label} must be a 64-char lowercase hex digest`);
    return "";
  }
  return value;
}

function expectFinitePair(value: unknown, label: string, issues: IssueCollector): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    issues.add(`${label} must be an array of exactly 2 finite numbers`);
    return [Number.NaN, Number.NaN];
  }
  return [expectFiniteNumber(value[0], `${label}[0]`, issues), expectFiniteNumber(value[1], `${label}[1]`, issues)];
}

function parseAffine(raw: unknown, issues: IssueCollector): ImageryAffine {
  if (!isPlainObject(raw)) {
    issues.add("affine must be an object");
    return { order: "a,b,c,d,e,f", values: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN], maps: "", coordinates: "" };
  }
  if (raw["order"] !== "a,b,c,d,e,f") {
    issues.add(`affine.order must be "a,b,c,d,e,f", got ${JSON.stringify(raw["order"])}`);
  }
  const maps = expectNonEmptyString(raw, "maps", "affine.maps", issues);
  const coordinates = expectNonEmptyString(raw, "coordinates", "affine.coordinates", issues);
  const valuesRaw = raw["values"];
  const values: number[] = [];
  if (!Array.isArray(valuesRaw) || valuesRaw.length !== 6) {
    issues.add("affine.values must be an array of exactly 6 finite numbers");
    values.push(Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN);
  } else {
    for (let i = 0; i < 6; i += 1) {
      values.push(expectFiniteNumber(valuesRaw[i], `affine.values[${i}]`, issues));
    }
  }
  return {
    order: "a,b,c,d,e,f",
    values: values as [number, number, number, number, number, number],
    maps,
    coordinates,
  };
}

function expectNonNegativeInteger(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  issues: IssueCollector,
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.add(`${label} must be a non-negative integer, got ${JSON.stringify(value)}`);
    return Number.NaN;
  }
  return value;
}

function parseRouteEndpoints(raw: unknown, issues: IssueCollector): ImageryRouteEndpoint[] {
  if (!Array.isArray(raw)) {
    issues.add("routeEndpoints must be an array");
    return [];
  }
  const out: ImageryRouteEndpoint[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!isPlainObject(entry)) {
      issues.add(`routeEndpoints[${i}] must be an object`);
      continue;
    }
    const row = expectNonNegativeInteger(entry, "row", `routeEndpoints[${i}].row`, issues);
    const col = expectNonNegativeInteger(entry, "col", `routeEndpoints[${i}].col`, issues);
    const image = expectFinitePair(entry["imageCornerCoordinates"], `routeEndpoints[${i}].imageCornerCoordinates`, issues);
    const projected = expectFinitePair(entry["projectedCoordinates"], `routeEndpoints[${i}].projectedCoordinates`, issues);
    const cost = expectFiniteNumber(entry["cost"], `routeEndpoints[${i}].cost`, issues);
    if (Number.isFinite(cost) && cost < 1) {
      issues.add(`routeEndpoints[${i}].cost must be >= 1 (friction floor), got ${cost}`);
    }
    out.push({ row, col, imageCornerCoordinates: image, projectedCoordinates: projected, cost });
  }
  return out;
}

/** Parse and validate a raw `imagery_metadata.json` payload. */
export function parseImageryMetadata(raw: unknown): ImageryMetadata {
  const issues = new IssueCollector();

  if (!isPlainObject(raw)) {
    throw new ImageryValidationError([
      `expected a JSON object, got ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}`,
    ]);
  }

  for (const key of Object.keys(raw)) {
    if (!METADATA_KEYS.includes(key)) {
      issues.add(`unexpected top-level key "${key}" (schema drift guard)`);
    }
  }

  if (raw["schemaVersion"] !== "1.0") {
    issues.add(`schemaVersion must be the string "1.0", got ${JSON.stringify(raw["schemaVersion"])}`);
  }
  const image = expectNonEmptyString(raw, "image", "image", issues);
  const mimeType = expectNonEmptyString(raw, "mimeType", "mimeType", issues);
  if (mimeType !== "image/png") {
    issues.add(`mimeType must be "image/png", got ${JSON.stringify(mimeType)}`);
  }
  const width = expectPositiveInteger(raw, "width", "width", issues);
  const height = expectPositiveInteger(raw, "height", "height", issues);
  const pixelFormat = expectNonEmptyString(raw, "pixelFormat", "pixelFormat", issues);
  const imageOrigin = expectNonEmptyString(raw, "imageOrigin", "imageOrigin", issues);

  const crsRaw = raw["crs"];
  let crs: GridCrs = { name: "", wkt: "", radiusMeters: Number.NaN };
  if (!isPlainObject(crsRaw)) {
    issues.add("crs must be an object");
  } else {
    crs = {
      name: expectNonEmptyString(crsRaw, "name", "crs.name", issues),
      wkt: expectNonEmptyString(crsRaw, "wkt", "crs.wkt", issues),
      radiusMeters: expectFiniteNumber(crsRaw["radiusMeters"], "crs.radiusMeters", issues),
    };
    if (Number.isFinite(crs.radiusMeters) && crs.radiusMeters <= 0) {
      issues.add("crs.radiusMeters must be > 0");
    }
  }

  const affine = parseAffine(raw["affine"], issues);

  const boundsRaw = raw["bounds"];
  let bounds: [number, number, number, number] = [Number.NaN, Number.NaN, Number.NaN, Number.NaN];
  if (!Array.isArray(boundsRaw) || boundsRaw.length !== 4) {
    issues.add("bounds must be an array of exactly 4 finite numbers");
  } else {
    bounds = boundsRaw.map((v) => expectFiniteNumber(v, "bounds", issues)) as [number, number, number, number];
    if (bounds.every(Number.isFinite)) {
      if (bounds[0] > bounds[2]) issues.add(`bounds west (${bounds[0]}) must be <= east (${bounds[2]})`);
      if (bounds[1] > bounds[3]) issues.add(`bounds south (${bounds[1]}) must be <= north (${bounds[3]})`);
    }
  }

  const resolution = expectFinitePair(raw["resolutionProjectedMeters"], "resolutionProjectedMeters", issues);
  for (const [i, value] of resolution.entries()) {
    if (Number.isFinite(value) && value <= 0) {
      issues.add(`resolutionProjectedMeters[${i}] must be > 0, got ${value}`);
    }
  }

  const navRaw = raw["navigationGrid"];
  let navigationGrid: ImageryMetadata["navigationGrid"] = {
    width: 0,
    height: 0,
    pixelsPerCell: [Number.NaN, Number.NaN],
    cellCenterToImage: "",
    metadataSha256: "",
  };
  if (!isPlainObject(navRaw)) {
    issues.add("navigationGrid must be an object");
  } else {
    const navWidth = expectPositiveInteger(navRaw, "width", "navigationGrid.width", issues);
    const navHeight = expectPositiveInteger(navRaw, "height", "navigationGrid.height", issues);
    const pixelsPerCell = expectFinitePair(navRaw["pixelsPerCell"], "navigationGrid.pixelsPerCell", issues);
    for (const [i, value] of pixelsPerCell.entries()) {
      if (Number.isFinite(value) && (!Number.isInteger(value) || value < 1)) {
        issues.add(`navigationGrid.pixelsPerCell[${i}] must be an integer >= 1, got ${value}`);
      }
    }
    navigationGrid = {
      width: navWidth,
      height: navHeight,
      pixelsPerCell: pixelsPerCell,
      cellCenterToImage: expectNonEmptyString(navRaw, "cellCenterToImage", "navigationGrid.cellCenterToImage", issues),
      metadataSha256: expectHex64(navRaw["metadataSha256"], "navigationGrid.metadataSha256", issues),
    };
  }

  const sourceRaw = raw["source"];
  let source: ImageryMetadata["source"] = { description: "", d08ImageSha256: "", ctxSourceFilename: "", ctxSourceSha256: "" };
  if (!isPlainObject(sourceRaw)) {
    issues.add("source must be an object");
  } else {
    source = {
      description: expectNonEmptyString(sourceRaw, "description", "source.description", issues),
      d08ImageSha256: expectHex64(sourceRaw["d08ImageSha256"], "source.d08ImageSha256", issues),
      ctxSourceFilename: expectNonEmptyString(sourceRaw, "ctxSourceFilename", "source.ctxSourceFilename", issues),
      ctxSourceSha256: expectHex64(sourceRaw["ctxSourceSha256"], "source.ctxSourceSha256", issues),
    };
  }

  const routeEndpoints = parseRouteEndpoints(raw["routeEndpoints"], issues);

  const limitationsRaw = raw["limitations"];
  const limitations: string[] = [];
  if (!Array.isArray(limitationsRaw)) {
    issues.add("limitations must be an array of strings");
  } else {
    for (let i = 0; i < limitationsRaw.length; i += 1) {
      const value = limitationsRaw[i];
      if (typeof value !== "string") {
        issues.add(`limitations[${i}] must be a string`);
      } else {
        limitations.push(value);
      }
    }
  }

  issues.throwIfAny();

  // Width/height are validated as positive integers; narrow the zero
  // sentinels away for the returned type.
  if (width < 1 || height < 1) {
    throw new ImageryValidationError(["width/height validation failed"]);
  }

  return {
    schemaVersion: "1.0",
    image,
    mimeType,
    width,
    height,
    pixelFormat,
    imageOrigin,
    crs,
    affine,
    bounds,
    resolutionProjectedMeters: resolution,
    navigationGrid,
    source,
    routeEndpoints,
    limitations,
  };
}

/**
 * Cross-check the imagery metadata against the verified navigation grid
 * model (fail-closed): identical bounds and CRS, pixel geometry consistent
 * with the grid dimensions, shared affine corner origin, and every declared
 * route endpoint resolving to a supported, unblocked, finite-cost cell whose
 * stored centre coordinates and friction match the grid exactly.
 */
export function expectImageryMatchesGrid(imagery: ImageryMetadata, model: NavigationGridModel): void {
  const problems: string[] = [];
  const nav = imagery.navigationGrid;

  if (imagery.width !== nav.width * nav.pixelsPerCell[0]) {
    problems.push(
      `imagery.width ${imagery.width} != navigationGrid.width ${nav.width} * pixelsPerCell ${nav.pixelsPerCell[0]}`,
    );
  }
  if (imagery.height !== nav.height * nav.pixelsPerCell[1]) {
    problems.push(
      `imagery.height ${imagery.height} != navigationGrid.height ${nav.height} * pixelsPerCell ${nav.pixelsPerCell[1]}`,
    );
  }
  if (nav.width !== model.width || nav.height !== model.height) {
    problems.push(
      `navigationGrid dims ${nav.width}x${nav.height} != model dims ${model.width}x${model.height}`,
    );
  }

  const boundsPairs: Array<[string, number, number]> = [
    ["west", imagery.bounds[0], model.metadata.bounds[0]],
    ["south", imagery.bounds[1], model.metadata.bounds[1]],
    ["east", imagery.bounds[2], model.metadata.bounds[2]],
    ["north", imagery.bounds[3], model.metadata.bounds[3]],
  ];
  for (const [name, imageValue, gridValue] of boundsPairs) {
    if (Math.abs(imageValue - gridValue) > METRIC_TOLERANCE) {
      problems.push(`imagery bounds.${name} ${imageValue} != grid bounds ${gridValue}`);
    }
  }

  if (imagery.crs.name !== model.metadata.crs.name) {
    problems.push(`imagery crs.name "${imagery.crs.name}" != grid crs.name "${model.metadata.crs.name}"`);
  }
  if (Math.abs(imagery.crs.radiusMeters - model.metadata.crs.radiusMeters) > METRIC_TOLERANCE) {
    problems.push("imagery crs.radiusMeters differs from grid");
  }

  // The image shares the grid's north-west corner origin.
  if (Math.abs(imagery.affine.values[2] - model.metadata.affine.values[2]) > METRIC_TOLERANCE) {
    problems.push("imagery affine c (west origin) differs from grid affine");
  }
  if (Math.abs(imagery.affine.values[5] - model.metadata.affine.values[5]) > METRIC_TOLERANCE) {
    problems.push("imagery affine f (north origin) differs from grid affine");
  }
  if (imagery.affine.values[1] !== 0 || imagery.affine.values[3] !== 0) {
    problems.push("imagery affine must be axis-aligned (b = d = 0) for the M2-03 click rules");
  }

  for (const [i, endpoint] of imagery.routeEndpoints.entries()) {
    const label = `routeEndpoints[${i}]`;
    if (!Number.isInteger(endpoint.row) || !Number.isInteger(endpoint.col) || endpoint.row < 0 || endpoint.col < 0) {
      problems.push(`${label}: row/col must be non-negative integers`);
      continue;
    }
    if (endpoint.row >= model.height || endpoint.col >= model.width) {
      problems.push(`${label}: [${endpoint.row},${endpoint.col}] is outside the grid`);
      continue;
    }
    const cell = model.getCell(endpoint.row, endpoint.col);
    if (!cell.traversable) {
      problems.push(`${label}: [${endpoint.row},${endpoint.col}] must be supported and unblocked`);
    }
    if (cell.cost !== endpoint.cost) {
      problems.push(`${label}: declared cost ${endpoint.cost} != grid cost ${cell.cost}`);
    }
    const centre = model.cellCenter(endpoint.row, endpoint.col);
    if (
      Math.abs(centre.x - endpoint.projectedCoordinates[0]) > METRIC_TOLERANCE ||
      Math.abs(centre.y - endpoint.projectedCoordinates[1]) > METRIC_TOLERANCE
    ) {
      problems.push(`${label}: declared projected centre differs from grid cell centre`);
    }
    const [ppcX, ppcY] = nav.pixelsPerCell;
    const expectedImageX = ppcX * (endpoint.col + 0.5);
    const expectedImageY = ppcY * (endpoint.row + 0.5);
    if (
      Math.abs(expectedImageX - endpoint.imageCornerCoordinates[0]) > METRIC_TOLERANCE ||
      Math.abs(expectedImageY - endpoint.imageCornerCoordinates[1]) > METRIC_TOLERANCE
    ) {
      problems.push(`${label}: declared image corner coordinates differ from (ppc*(col+0.5), ppc*(row+0.5))`);
    }
  }

  if (problems.length > 0) {
    throw new ImageryValidationError(problems);
  }
}

/**
 * Fetch + validate `imagery_metadata.json` from a base URL such as
 * "/data/M2_04".
 *
 * NOTE: this convenience does NOT verify served bytes against a checksum
 * manifest. The app startup path uses `dataVerification.loadVerifiedPackages`,
 * which hashes the exact bytes it parses; use that for anything user-facing.
 */
export async function fetchImageryMetadata(baseUrl: string, init?: RequestInit): Promise<ImageryMetadata> {
  const url = `${baseUrl.replace(/\/$/, "")}/imagery_metadata.json`;
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch imagery metadata (${url}): HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new Error(`imagery_metadata.json at ${url} is not valid JSON`, { cause });
  }
  return parseImageryMetadata(raw);
}

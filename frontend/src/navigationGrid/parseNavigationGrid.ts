/**
 * Validator for `navigation_grid.json` (M2-02 export, schemaVersion "1.0").
 *
 * Validates, fail-closed:
 * - dimensions (width/height positive integers) and that all three arrays are
 *   flat with exactly `width * height` elements (row-major layout declared in
 *   grid_metadata.json; index `i = row * width + col`),
 * - mask values are exactly the numbers 0 or 1 (booleans rejected),
 * - costs are null or finite numbers with the schema-1.0 friction floor of 1
 *   (the source policy defines friction `1 + (slope_degrees/10)^2`),
 * - null semantics: `cost === null` if and only if the cell is unknown
 *   (validDataMask = 0) or blocked (blockedMask = 1); blocked cells must be
 *   supported; unknown and blocked cells must never be filled in.
 *
 * The friction number is a research dimensionless index, not an energy, time
 * or safety measurement.
 */

import { NavigationGridValidationError } from "./errors.ts";
import type { CellCost, MaskValue, NavigationGrid } from "./types.ts";

const GRID_KEYS: readonly string[] = [
  "schemaVersion",
  "width",
  "height",
  "cost",
  "validDataMask",
  "blockedMask",
];

/** Schema-1.0 friction floor from the D07 source policy (slope 0 => friction 1). */
const MIN_FINITE_COST = 1;

/** Maximum number of issues reported in the error before truncation. */
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

/** Parse and fully validate a raw `navigation_grid.json` payload. */
export function parseNavigationGrid(raw: unknown): NavigationGrid {
  const issues = new IssueCollector();

  if (!isPlainObject(raw)) {
    throw new NavigationGridValidationError(
      [`expected a JSON object, got ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}`],
      1,
      1,
    );
  }

  for (const key of Object.keys(raw)) {
    if (!GRID_KEYS.includes(key)) {
      issues.add(`unexpected top-level key "${key}" (schema drift guard)`);
    }
  }

  const schemaVersion = raw["schemaVersion"];
  if (schemaVersion !== "1.0") {
    issues.add(`schemaVersion must be the string "1.0", got ${JSON.stringify(schemaVersion)}`);
  }

  const width = expectPositiveInteger(raw, "width", issues);
  const height = expectPositiveInteger(raw, "height", issues);

  const costRaw = raw["cost"];
  const validDataMaskRaw = raw["validDataMask"];
  const blockedMaskRaw = raw["blockedMask"];
  for (const [key, value] of [
    ["cost", costRaw],
    ["validDataMask", validDataMaskRaw],
    ["blockedMask", blockedMaskRaw],
  ] as const) {
    if (!Array.isArray(value)) {
      issues.add(`${key} must be a flat array, got ${value === null ? "null" : typeof value}`);
    }
  }

  issues.throwIfAny();

  const cost = costRaw as unknown[];
  const validDataMask = validDataMaskRaw as unknown[];
  const blockedMask = blockedMaskRaw as unknown[];

  const expectedLength = width * height;
  for (const [key, value] of [
    ["cost", cost],
    ["validDataMask", validDataMask],
    ["blockedMask", blockedMask],
  ] as const) {
    if (value.length !== expectedLength) {
      issues.add(
        `${key} must have exactly width*height = ${expectedLength} elements (flat row-major), got ${value.length}`,
      );
    }
  }

  const scanLength = Math.min(cost.length, validDataMask.length, blockedMask.length);
  for (let i = 0; i < scanLength; i += 1) {
    const cellCost = cost[i] as CellCost | undefined;
    const valid = validDataMask[i];
    const blocked = blockedMask[i];

    const validOk = valid === 0 || valid === 1;
    const blockedOk = blocked === 0 || blocked === 1;
    if (!validOk) {
      issues.add(
        `validDataMask[${i}] must be exactly 0 or 1, got ${JSON.stringify(valid)}`,
      );
    }
    if (!blockedOk) {
      issues.add(
        `blockedMask[${i}] must be exactly 0 or 1, got ${JSON.stringify(blocked)}`,
      );
    }

    if (cellCost !== null && (typeof cellCost !== "number" || !Number.isFinite(cellCost))) {
      issues.add(
        `cost[${i}] must be null or a finite number, got ${JSON.stringify(cellCost)}`,
      );
    } else if (typeof cellCost === "number" && cellCost < MIN_FINITE_COST) {
      issues.add(
        `cost[${i}] = ${cellCost} is below the schema-1.0 friction floor of ${MIN_FINITE_COST} ` +
          "(source policy: friction = 1 + (slope_degrees/10)^2; a research index, not energy/time/safety)",
      );
    }

    // Null semantics. Mask values are checked above; when a mask value is
    // invalid we still evaluate against its actual value to report the cost
    // rule that most likely applies.
    const unknown = valid === 0;
    const isBlocked = blocked === 1;
    if (cellCost === null) {
      if (!unknown && !isBlocked) {
        issues.add(
          `cost[${i}] is null but the cell is supported and unblocked (validDataMask=1, blockedMask=0); ` +
            "supported unblocked cells must have a finite cost",
        );
      }
    } else if (typeof cellCost === "number" && Number.isFinite(cellCost)) {
      if (unknown) {
        issues.add(
          `cost[${i}] must be null for an unknown cell (validDataMask=0); unknown cells must never be filled`,
        );
      }
      if (isBlocked) {
        issues.add(
          `cost[${i}] must be null for a blocked cell (blockedMask=1); blocked cells are excluded from routing`,
        );
      }
    }
    if (isBlocked && unknown) {
      issues.add(
        `blockedMask[${i}] = 1 but validDataMask[${i}] = 0; blocked cells are data-supported ` +
          "(hazard class 3) and must also be supported",
      );
    }
  }

  issues.throwIfAny();

  return {
    schemaVersion: "1.0",
    width,
    height,
    cost: cost as readonly CellCost[],
    validDataMask: validDataMask as readonly MaskValue[],
    blockedMask: blockedMask as readonly MaskValue[],
  };
}

/**
 * Error types for the MARS NAVIGATOR navigation grid loader.
 *
 * All errors are thrown fail-closed: invalid data never produces a partially
 * usable grid object.
 */

/** Base class so consumers can catch every loader-specific failure at once. */
export class NavigationGridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavigationGridError";
  }
}

/**
 * The JSON payload violated the M2-02 export contract. `issues` lists each
 * concrete violation (capped for very large grids), e.g. a wrong array length
 * or a blocked cell carrying a non-null cost.
 */
export class NavigationGridValidationError extends NavigationGridError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[], shown: number, total: number) {
    const suffix = total > shown ? ` (showing first ${shown} of ${total})` : "";
    super(`${total} validation issue(s)${suffix}:\n  - ${issues.join("\n  - ")}`);
    this.name = "NavigationGridValidationError";
    this.issues = [...issues];
  }
}

/** A row/col pair or flat index is outside the grid, or not an integer. */
export class OutOfBoundsError extends NavigationGridError {
  readonly row: number | null;
  readonly col: number | null;
  readonly index: number | null;

  constructor(message: string, details: { row?: number; col?: number; index?: number } = {}) {
    super(message);
    this.name = "OutOfBoundsError";
    this.row = details.row ?? null;
    this.col = details.col ?? null;
    this.index = details.index ?? null;
  }
}

/**
 * The affine matrix [[a, b], [d, e]] has no inverse, so projected metres
 * cannot be mapped back to cells. Forward cell->world conversion still works.
 */
export class SingularAffineError extends NavigationGridError {
  readonly determinant: number;

  constructor(determinant: number) {
    super(
      `Affine matrix [[a,b],[d,e]] is singular (determinant ${determinant}); ` +
        "projected coordinates cannot be inverted to cells.",
    );
    this.name = "SingularAffineError";
    this.determinant = determinant;
  }
}

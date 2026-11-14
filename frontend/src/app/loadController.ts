/**
 * Latest-request-wins load controller for the MARS NAVIGATOR startup gate
 * (M1-04 async race fix).
 *
 * ROOT CAUSE (QA): `App.load()` applied success and failure state with an
 * unconditional `setDataState` — under React Strict Mode's
 * setup → cleanup → setup lifecycle (or a Retry click while a load was
 * pending), an OLDER delayed load A could complete after a NEWER failed
 * load B and overwrite B's error with a map + integrity PASS badge.
 *
 * FIX: every load attempt gets a monotonically increasing generation id.
 * A new `start()` or `dispose()` invalidates all older generations; before
 * ANY state application (loading, success, failure, decode result) the
 * controller confirms the attempt is still current and otherwise ignores
 * it — including Blob URLs the stale attempt already created, which are
 * revoked immediately and never exposed.
 *
 * An AbortController cancels in-flight fetches of superseded attempts for
 * efficiency only; the generation checks remain the authoritative gate.
 *
 * The verified Blob URL and the ready payload live in ONE coherent state
 * object, emitted atomically, so a URL can never be displayed with data
 * from a different load. The active URL is revoked only when it is no
 * longer displayed (superseded by a newer ready state, replaced by an
 * error/loading state, or on dispose) — never prematurely while displayed.
 *
 * Framework-free and deterministically testable: all asynchronous effects
 * enter through the injected `loadPackages`/`decodeImage` dependencies,
 * which tests control with deferred promises instead of sleeps.
 */

import type { NavigationGridModel } from "../navigationGrid/index.ts";
import type { ImageryMetadata } from "./imagery.ts";
import type { PackageVerification, VerifiedPackages, VerifiedTerrainImage } from "./dataVerification.ts";

export type { VerifiedPackages };

export interface LoadControllerState {
  readonly generation: number;
}

export type ControllerState =
  | { readonly status: "loading"; readonly generation: number }
  | { readonly status: "error"; readonly message: string; readonly generation: number }
  | {
      readonly status: "ready";
      readonly model: NavigationGridModel;
      readonly imagery: ImageryMetadata;
      readonly verification: PackageVerification;
      /** Blob/object URL created from the exact verified PNG bytes. */
      readonly terrainUrl: string;
      readonly generation: number;
    };

export interface LoadControllerDependencies {
  /** Performs the full verification gate; may reject (failures, aborts). */
  readonly loadPackages: (signal: AbortSignal) => Promise<VerifiedPackages>;
  /** Creates a display URL over the verified PNG bytes (e.g. Blob URL). */
  readonly createImageUrl: (terrainImage: VerifiedTerrainImage) => string;
  /** Eagerly decodes the verified PNG bytes; optional (skipped if absent). */
  readonly decodeImage?: (bytes: ArrayBuffer, mimeType: string) => Promise<void>;
  /** Revokes a display URL. */
  readonly revokeUrl: (url: string) => void;
  /** Receives every state transition. */
  readonly onStateChange: (state: ControllerState) => void;
}

export class VerifiedLoadController {
  #generation = 0;
  #activeUrl: string | null = null;
  #abort: AbortController | null = null;
  #disposed = false;
  #lastState: ControllerState | undefined;
  readonly #deps: LoadControllerDependencies;
  readonly #decodeImage: ((bytes: ArrayBuffer, mimeType: string) => Promise<void>) | undefined;

  constructor(deps: LoadControllerDependencies) {
    this.#deps = deps;
    this.#decodeImage = deps.decodeImage;
  }

  get generation(): number {
    return this.#generation;
  }

  /**
   * Begin a new load attempt. Invalidates every older attempt: their
   * fetches are aborted and their results (success OR failure) will be
   * ignored. The previously displayed Blob URL is revoked because the map
   * is replaced by the loading state. Re-activates a disposed controller
   * (React Strict Mode setup → cleanup → setup).
   */
  start(): void {
    this.#disposed = false;
    this.#generation += 1;
    const generation = this.#generation;
    this.#abortPrevious();
    this.#revokeActiveUrl();
    this.#emit({ status: "loading", generation });
    this.#abort = new AbortController();
    void this.#run(generation, this.#abort.signal);
  }

  /**
   * The displayed (current-generation) image failed to decode in the
   * browser. Fail closed — but only if this ready state is still the
   * newest generation, so an obsolete image can never overwrite newer
   * state.
   */
  handleImageDecodeError(): void {
    const state = this.#lastState;
    if (
      state !== undefined &&
      state.status === "ready" &&
      state.generation === this.#generation &&
      !this.#disposed
    ) {
      this.#revokeActiveUrl();
      this.#emit({
        status: "error",
        message:
          "The verified terrain image failed to decode in the browser — refusing to render a broken map. " +
          "Retry to re-verify the packages.",
        generation: this.#generation,
      });
    }
  }

  /**
   * Invalidate everything: pending loads are ignored, in-flight fetches
   * aborted, the active Blob URL revoked. Used by React effect cleanup
   * (Strict Mode setup → cleanup → setup) and real unmounts — either way
   * a later resolution must never leak state or Blob URLs.
   */
  dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#abortPrevious();
    this.#revokeActiveUrl();
  }

  #abortPrevious(): void {
    if (this.#abort !== null) {
      this.#abort.abort();
      this.#abort = null;
    }
  }

  #revokeActiveUrl(): void {
    if (this.#activeUrl !== null) {
      this.#deps.revokeUrl(this.#activeUrl);
      this.#activeUrl = null;
    }
  }

  #emit(state: ControllerState): void {
    this.#lastState = state;
    this.#deps.onStateChange(state);
  }

  async #run(generation: number, signal: AbortSignal): Promise<void> {
    try {
      const result: VerifiedPackages = await this.#deps.loadPackages(signal);
      if (this.#isStale(generation)) {
        return; // stale SUCCESS: ignored, no map, no integrity claim
      }

      // Eagerly decode the verified PNG bytes before committing "ready" —
      // bytes that cannot decode must fail closed. Re-check staleness
      // across the await so a decode of a superseded attempt is ignored.
      if (this.#decodeImage !== undefined) {
        await this.#decodeImage(result.terrainImage.bytes, result.terrainImage.mimeType);
        if (this.#isStale(generation)) {
          return; // obsolete image decode result: never overwrite newer state
        }
      }

      // Create the display URL over the verified bytes, then re-check: if a
      // newer attempt started while we were decoding, this URL is revoked
      // immediately and never exposed.
      const terrainUrl = this.#deps.createImageUrl(result.terrainImage);
      if (this.#isStale(generation)) {
        this.#deps.revokeUrl(terrainUrl);
        return;
      }
      this.#revokeActiveUrl();
      this.#activeUrl = terrainUrl;
      this.#emit({
        status: "ready",
        model: result.model,
        imagery: result.imagery,
        verification: result.verification,
        terrainUrl,
        generation,
      });
    } catch (cause) {
      if (this.#isStale(generation)) {
        return; // stale FAILURE: ignored — newer state (error or map) stands
      }
      this.#revokeActiveUrl();
      this.#emit({
        status: "error",
        message: cause instanceof Error ? cause.message : String(cause),
        generation,
      });
    }
  }

  #isStale(generation: number): boolean {
    return this.#disposed || generation !== this.#generation;
  }
}

/**
 * MARS NAVIGATOR — application shell (M1-02/03/04).
 *
 * Loads the verified M2-02 navigation package and M2-04 imagery package
 * through the latest-request-wins load controller (fail-closed: checksum +
 * metadata cross-validation must pass before the map renders), hosts the
 * interactive map viewport, and manages endpoint selection plus the M5
 * route-status placeholder.
 *
 * Async-race safety: every load attempt runs through VerifiedLoadController,
 * which assigns a monotonic generation, ignores superseded successes AND
 * failures, aborts superseded fetches, and owns the verified-Blob-URL
 * lifecycle (created only for current attempts, revoked on supersede and
 * dispose). React Strict Mode's setup → cleanup → setup lifecycle and
 * Retry-clicks-while-pending are both safe by construction.
 *
 * RESEARCH/DEMO DATA — NOT FOR OPERATIONAL MARS NAVIGATION. Friction is a
 * dimensionless research index, not energy, time or safety; data support and
 * slope thresholds do not establish real traversability. A* routing is a
 * separate task (M5) and no route is ever fabricated here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavigationGridModel } from "../navigationGrid/index.ts";
import {
  loadVerifiedPackages,
  type PackageVerification,
} from "./dataVerification.ts";
import {
  VerifiedLoadController,
  type ControllerState,
} from "./loadController.ts";
import type { ImageryMetadata } from "./imagery.ts";
import {
  cellCenterImagePoint,
  cellRefFromCell,
  selectCellAtImagePoint,
  type CellSelection,
  type GridCellRef,
} from "./selection.ts";
import { routeStatusForSelections } from "../route/contract.ts";
import { MapViewport, type MapMarker } from "./components/MapViewport.tsx";
import type { Point } from "./mapTransform.ts";

type DataState = ControllerState;

type ArmMode = "start" | "goal" | null;

const NAVIGATION_BASE = "/data/M2_02";
const IMAGERY_BASE = "/data/M2_04";

export function App() {
  const [dataState, setDataState] = useState<DataState>({ status: "loading", generation: 0 });
  const [inspected, setInspected] = useState<CellSelection | null>(null);
  const [hovered, setHovered] = useState<CellSelection | null>(null);
  const [start, setStart] = useState<GridCellRef | null>(null);
  const [goal, setGoal] = useState<GridCellRef | null>(null);
  const [armMode, setArmMode] = useState<ArmMode>(null);

  // One controller per app lifetime: it owns load generations, the
  // verified-Blob-URL lifecycle and all stale-result gating.
  const controllerRef = useRef<VerifiedLoadController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new VerifiedLoadController({
      loadPackages: (signal) => loadVerifiedPackages(NAVIGATION_BASE, IMAGERY_BASE, { signal }),
      createImageUrl: (terrainImage) =>
        URL.createObjectURL(new Blob([terrainImage.bytes], { type: terrainImage.mimeType })),
      decodeImage:
        typeof createImageBitmap === "function"
          ? async (bytes, mimeType) => {
              // Fail closed if the verified PNG cannot decode on this
              // platform; the controller gates this against staleness.
              const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
              bitmap.close();
            }
          : undefined,
      revokeUrl: (url) => URL.revokeObjectURL(url),
      onStateChange: (state) => setDataState(state),
    });
  }

  // Mount: start the first load. Cleanup: dispose (Strict Mode's
  // setup → cleanup → setup invalidates attempt 1 and starts attempt 2;
  // real unmount invalidates everything and revokes the Blob URL).
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller === null) {
      throw new Error("load controller missing");
    }
    controller.start();
    return () => controller.dispose();
  }, []);

  const retry = useCallback(() => {
    controllerRef.current?.start();
  }, []);

  const handleImageDecodeError = useCallback(() => {
    controllerRef.current?.handleImageDecodeError();
  }, []);

  if (dataState.status === "loading") {
    return (
      <div className="app-frame center">
        <div className="state-card" role="status">
          <h1>MARS NAVIGATOR</h1>
          <p className="loading-line">Loading and verifying the navigation + imagery packages…</p>
        </div>
      </div>
    );
  }

  if (dataState.status === "error") {
    return (
      <div className="app-frame center">
        <div className="state-card error" role="alert">
          <h1>MARS NAVIGATOR</h1>
          <p className="error-title">Data could not be loaded — nothing is displayed rather than guessing.</p>
          <pre className="error-detail">{dataState.message}</pre>
          <button type="button" className="btn" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReadyApp
      model={dataState.model}
      imagery={dataState.imagery}
      verification={dataState.verification}
      // Invariant: a "ready" state always carries the Blob URL created from
      // its own verified bytes.
      terrainUrl={dataState.terrainUrl}
      onImageError={handleImageDecodeError}
      inspected={inspected}
      hovered={hovered}
      start={start}
      goal={goal}
      armMode={armMode}
      setInspected={setInspected}
      setHovered={setHovered}
      setStart={setStart}
      setGoal={setGoal}
      setArmMode={setArmMode}
    />
  );
}

interface ReadyAppProps {
  readonly model: NavigationGridModel;
  readonly imagery: ImageryMetadata;
  readonly verification: PackageVerification;
  /** Blob/object URL over the SHA-256-verified PNG bytes (never the origin URL). */
  readonly terrainUrl: string;
  readonly onImageError: () => void;
  readonly inspected: CellSelection | null;
  readonly hovered: CellSelection | null;
  readonly start: GridCellRef | null;
  readonly goal: GridCellRef | null;
  readonly armMode: ArmMode;
  readonly setInspected: (selection: CellSelection) => void;
  readonly setHovered: (selection: CellSelection | null) => void;
  readonly setStart: (ref: GridCellRef | null) => void;
  readonly setGoal: (ref: GridCellRef | null) => void;
  readonly setArmMode: (mode: ArmMode) => void;
}

function ReadyApp(props: ReadyAppProps) {
  const { model, imagery, verification } = props;
  const verifiedCount = verification.checks.filter((c) => c.ok).length;

  const handleImageClick = (imagePoint: Point) => {
    const selection = selectCellAtImagePoint(model, imagery, imagePoint);
    props.setInspected(selection);
    if (selection.status === "selected") {
      const ref = cellRefFromCell(selection.cell);
      if (props.armMode === "start") {
        props.setStart(ref);
        props.setArmMode(null);
      } else if (props.armMode === "goal") {
        props.setGoal(ref);
        props.setArmMode(null);
      }
    }
  };

  const handleHover = (imagePoint: Point | null) => {
    if (imagePoint === null) {
      props.setHovered(null);
      return;
    }
    props.setHovered(selectCellAtImagePoint(model, imagery, imagePoint));
  };

  const loadContractEndpoints = () => {
    const endpoints = imagery.routeEndpoints;
    const first = endpoints[0];
    const second = endpoints[1];
    if (first === undefined || second === undefined) {
      return;
    }
    props.setStart({ row: first.row, col: first.col, index: first.row * model.width + first.col });
    props.setGoal({ row: second.row, col: second.col, index: second.row * model.width + second.col });
    props.setArmMode(null);
  };

  const markers: MapMarker[] = [];
  if (props.start !== null) {
    markers.push({ role: "start", ref: props.start });
  }
  if (props.goal !== null) {
    markers.push({ role: "goal", ref: props.goal });
  }

  const routeStatus = routeStatusForSelections(model, props.start, props.goal);
  const routeRequestOk = routeStatus.state === "awaiting-router";
  const routeRequest = routeRequestOk ? routeStatus.request : null;
  const routeRequestText = routeRequest === null ? null : JSON.stringify(routeRequest, null, 2);

  const inspector = props.hovered ?? props.inspected;
  const limitations = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of [...imagery.limitations, ...model.metadata.limitations]) {
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
    return out;
  }, [imagery.limitations, model.metadata.limitations]);

  const armedHint =
    props.armMode === "start"
      ? "Click a traversable cell to set Start (A)"
      : props.armMode === "goal"
        ? "Click a traversable cell to set Goal (B)"
        : null;

  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <h1>MARS NAVIGATOR</h1>
          <p className="subtitle">
            Jezero Crater Western Fan — CTX terrain over the verified 267 × 267 navigation grid.{" "}
            <strong>Research/demo only; not operational navigation.</strong>
          </p>
        </div>
        <div className="data-chips">
          <span className="chip chip-ok">
            Grid {model.width}×{model.height} · {model.metadata.statistics.blocked} blocked ·{" "}
            {model.metadata.statistics.finiteCost} traversable
          </span>
          <span className="chip chip-ok">
            Imagery {imagery.width}×{imagery.height} px · {imagery.resolutionProjectedMeters[0]} m/px
          </span>
          <span
            className="chip chip-ok"
            title={`All ${verification.checks.length} manifest entries were downloaded and SHA-256 byte-verified against the pinned accepted package reference; both served manifests match that reference, and the grid-metadata cross-link matches. The displayed image is rendered from the verified bytes.`}
          >
            SHA-256 integrity PASS · {verifiedCount}/{verification.checks.length} files byte-verified · 2/2 manifests
            match accepted references
          </span>
        </div>
      </header>

      <main className="app-main">
        <MapViewport
          imageUrl={props.terrainUrl}
          imagery={imagery}
          markers={markers}
          armedHint={armedHint}
          onImageClick={handleImageClick}
          onImageHover={handleHover}
          onImageError={props.onImageError}
        />

        <aside className="side-panel">
          <section className="panel-section">
            <h2>Endpoints</h2>
            <div className="btn-row">
              <button
                type="button"
                className={`btn ${props.armMode === "start" ? "btn-armed" : ""}`}
                onClick={() => props.setArmMode(props.armMode === "start" ? null : "start")}
              >
                Set Start (A)
              </button>
              <button
                type="button"
                className={`btn ${props.armMode === "goal" ? "btn-armed" : ""}`}
                onClick={() => props.setArmMode(props.armMode === "goal" ? null : "goal")}
              >
                Set Goal (B)
              </button>
              <button type="button" className="btn" onClick={loadContractEndpoints}>
                Load contract endpoints
              </button>
            </div>
            <EndpointRow role="Start (A)" ref_={props.start} model={model} imagery={imagery} onClear={() => props.setStart(null)} />
            <EndpointRow role="Goal (B)" ref_={props.goal} model={model} imagery={imagery} onClear={() => props.setGoal(null)} />

            <h3>Route status</h3>
            <div className={`route-status route-${routeStatus.state}`}>
              <p>{routeStatus.detail}</p>
              {routeRequestText !== null ? (
                <details>
                  <summary>M5 router request (typed)</summary>
                  <pre className="error-detail">{routeRequestText}</pre>
                </details>
              ) : null}
            </div>
          </section>

          <section className="panel-section">
            <h2>Cell inspector</h2>
            {inspector === null ? (
              <p className="muted">Hover or click the map to inspect a cell.</p>
            ) : (
              <CellFacts selection={inspector} />
            )}
            {props.hovered !== null && props.inspected !== null ? (
              <p className="muted small">Showing hovered cell; click pins a selection.</p>
            ) : null}
          </section>

          <section className="panel-section">
            <h2>Data &amp; integrity</h2>
            <ul className="facts">
              <li>
                Navigation: <code>{NAVIGATION_BASE}</code> — schema {model.metadata.schemaVersion}, row-major,{" "}
                {model.metadata.statistics.total} cells, CRS {model.metadata.crs.name}.
              </li>
              <li>
                Imagery: <code>{IMAGERY_BASE}</code> — {imagery.image}, 5 m/px, bounds equal to grid bounds,{" "}
                CRS matches.
              </li>
            </ul>
            <p className="small">
              Every manifest entry is downloaded once and its bytes SHA-256 hashed against the pinned accepted package
              reference; the grid model and the displayed image are built from those same verified bytes. Any mismatch
              refuses to render.
            </p>
            <ul className="integrity-list">
              {verification.checks.map((check) => (
                <li key={check.label} className={check.ok ? "integrity-ok" : "integrity-fail"}>
                  {check.ok ? "✓" : "✕"} {check.label} — {check.detail}
                </li>
              ))}
              <li className="integrity-ok">✓ grid-metadata cross-link (imagery ↔ navigation)</li>
              <li className="integrity-ok">✓ both served manifests match the accepted package reference</li>
            </ul>
          </section>

          <section className="panel-section limitations">
            <h2>Limitations &amp; attribution</h2>
            <ul>
              {limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="small">
              Terrain image: USGS Astrogeology Science Center, Mars 2020 TRN Context Camera Orthorectified Image
              Mosaic (Fergason et al., 2020), NASA Mars Reconnaissance Orbiter —{" "}
              <a href="https://doi.org/10.5066/P9GV1ND3" target="_blank" rel="noreferrer">
                DOI 10.5066/P9GV1ND3
              </a>
              . NASA/USGS do not endorse this prototype.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

interface EndpointRowProps {
  readonly role: string;
  readonly ref_: GridCellRef | null;
  readonly model: NavigationGridModel;
  readonly imagery: ImageryMetadata;
  readonly onClear: () => void;
}

function EndpointRow({ role, ref_, model, imagery, onClear }: EndpointRowProps) {
  if (ref_ === null) {
    return (
      <div className="endpoint-row">
        <span className="endpoint-badge">{role}</span>
        <span className="muted">not set</span>
      </div>
    );
  }
  const cell = model.getCell(ref_.row, ref_.col);
  const centre = model.cellCenter(ref_.row, ref_.col);
  const imagePoint = cellCenterImagePoint(imagery, ref_);
  return (
    <div className="endpoint-row">
      <span className="endpoint-badge">{role}</span>
      <span className="endpoint-facts">
        [{ref_.row}, {ref_.col}] · img ({imagePoint.x}, {imagePoint.y}) · friction{" "}
        {cell.cost === null ? "null" : cell.cost.toFixed(6)} · x {centre.x.toFixed(3)}, y {centre.y.toFixed(3)}
      </span>
      <button type="button" className="btn btn-small" onClick={onClear} aria-label={`Clear ${role}`}>
        ✕
      </button>
    </div>
  );
}

function CellFacts({ selection }: { readonly selection: CellSelection }) {
  if (selection.status === "rejected" && selection.cell === null) {
    return (
      <div className="selection rejection">
        <span className="chip chip-reject">rejected · {selection.reason}</span>
        <p>{selection.detail}</p>
        {selection.projected !== null ? (
          <p className="small">
            projected: x {selection.projected.x.toFixed(3)}, y {selection.projected.y.toFixed(3)} m
          </p>
        ) : null}
      </div>
    );
  }
  const cell = selection.cell;
  if (cell === null) {
    return null;
  }
  const statusWord =
    selection.status === "selected" ? "traversable" : selection.reason === "blocked" ? "blocked" : "unknown";
  return (
    <div className={`selection ${selection.status === "selected" ? "ok" : "rejection"}`}>
      <span className={`chip ${selection.status === "selected" ? "chip-ok" : "chip-reject"}`}>
        {selection.status === "selected" ? "selected" : "rejected"} · {statusWord}
      </span>
      <ul className="facts">
        <li>
          grid [row, col]: <strong>[{cell.row}, {cell.col}]</strong> · flat index {cell.index}
        </li>
        <li>
          image px: ({selection.image.x.toFixed(2)}, {selection.image.y.toFixed(2)})
        </li>
        <li>
          projected: x {selection.projected?.x.toFixed(3)}, y {selection.projected?.y.toFixed(3)} m (Mars 2000
          equirectangular — not WGS84)
        </li>
        <li>
          supported {String(cell.supported)} · blocked {String(cell.blocked)} · friction{" "}
          {cell.cost === null ? "null (excluded from routing)" : cell.cost}
        </li>
      </ul>
      {selection.status === "rejected" ? <p>{selection.detail}</p> : null}
    </div>
  );
}

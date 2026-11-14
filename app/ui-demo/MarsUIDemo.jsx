"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MarsUIDemo.module.css";

const DEFAULT_LEGEND = [
  {
    label: "CTX imagery",
    description: "Background surface imagery",
    color: "#8c7d70",
  },
  {
    label: "Elevation",
    description: "Lower to higher terrain",
    color: "#6c8d9b",
  },
  {
    label: "Slope",
    description: "Gentle to steep terrain",
    color: "#e4ad49",
  },
  {
    label: "Movement cost",
    description: "Lower to higher experimental cost",
    color: "#d66d42",
  },
  {
    label: "Traversability",
    description: "Passable or blocked cells",
    color: "#806aa8",
  },
];

export function MapLegend({ items = DEFAULT_LEGEND }) {
  return (
    <section className={styles.card} aria-labelledby="legend-title">
      <h2 id="legend-title">Map legend</h2>
      <p className={styles.muted}>Example labels and colors.</p>

      <ul className={styles.legendList}>
        {items.map((item) => (
          <li className={styles.legendItem} key={item.label}>
            <span
              className={styles.swatch}
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span>
              <strong>{item.label}</strong>
              <span className={styles.description}>{item.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowToUseModal({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="how-to-title"
      onClose={onClose}
    >
      <div className={styles.modalHeader}>
        <h2 id="how-to-title">How to use the map</h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close instructions"
        >
          ×
        </button>
      </div>

      <ol className={styles.instructions}>
        <li>Select a starting point <strong>A</strong> on the map.</li>
        <li>Select a destination <strong>B</strong>.</li>
        <li>Run A* and view the route and its details on the map.</li>
      </ol>

      <p className={styles.muted}>
        These instructions describe the planned map workflow. This demo does
        not run routing.
      </p>

      <button type="button" className={styles.button} onClick={onClose}>
        Got it
      </button>
    </dialog>
  );
}

function displayValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  return `${value}${suffix}`;
}

export function TerrainInfoPanel({
  coordinate,
  elevation,
  slope,
  movementCost,
}) {
  return (
    <section className={styles.card} aria-labelledby="terrain-title">
      <h2 id="terrain-title">Terrain information</h2>
      <p className={styles.muted}>Values shown here are mock data.</p>

      <dl className={styles.details}>
        <div>
          <dt>Coordinate</dt>
          <dd>{displayValue(coordinate)}</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>{displayValue(elevation, " m")}</dd>
        </div>
        <div>
          <dt>Slope</dt>
          <dd>{displayValue(slope, "°")}</dd>
        </div>
        <div>
          <dt>Movement cost</dt>
          <dd>{displayValue(movementCost)}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Movement cost is experimental, not a validated safety assessment.
      </p>
    </section>
  );
}

export function LoadingState({ message = "Loading map data…" }) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <strong>Unable to load</strong>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={styles.button} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  message = "No route to display yet.",
}) {
  return (
    <div className={styles.state}>
      <strong>Nothing here yet</strong>
      <p>{message}</p>
    </div>
  );
}

export default function MarsUIDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [demoState, setDemoState] = useState("empty");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MARS NAVIGATOR</p>
          <h1>Map UI demo</h1>
          <p className={styles.muted}>
            Static components and mock data — no GIS or backend connection.
          </p>
        </div>

        <button
          type="button"
          className={styles.button}
          onClick={() => setModalOpen(true)}
        >
          How to use
        </button>
      </header>

      <div className={styles.layout}>
        <div className={styles.mapArea}>
          <section className={styles.card}>
            <h2>Map placeholder</h2>
            <p className={styles.muted}>
              The interactive map and A* route will be integrated separately.
            </p>
          </section>

          <section className={styles.card} aria-labelledby="states-title">
            <h2 id="states-title">Demo states</h2>
            <p className={styles.muted}>
              Use these controls to preview the reusable UI states.
            </p>

            <div className={styles.controls} aria-label="Choose demo state">
              {["loading", "error", "empty"].map((state) => (
                <button
                  key={state}
                  type="button"
                  className={
                    demoState === state
                      ? styles.activeButton
                      : styles.secondaryButton
                  }
                  aria-pressed={demoState === state}
                  onClick={() => setDemoState(state)}
                >
                  {state.charAt(0).toUpperCase() + state.slice(1)}
                </button>
              ))}
            </div>

            {demoState === "loading" && <LoadingState />}
            {demoState === "error" && (
              <ErrorState
                message="This is a mock error for UI testing."
                onRetry={() => setDemoState("empty")}
              />
            )}
            {demoState === "empty" && <EmptyState />}
          </section>
        </div>

        <aside className={styles.sidebar} aria-label="Map information">
          <MapLegend />
          <TerrainInfoPanel
            coordinate="Row 120, column 85"
            elevation={-2450}
            slope={8.5}
            movementCost="1.4 — mock score"
          />
        </aside>
      </div>

      <HowToUseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </main>
  );
}

// Route comparison cards (M4-03).
//
// Each card takes a live route result and shows the numbers the D08 pipeline
// produces, so the panel and the map always agree.
//
// The two cards are a comparison, so they share one row of labels: each
// metric reads across, which is the only way to see which route wins.

import type { RouteMode, RouteResult } from '../lib/router';
import { MODE_COLOR, MODE_LABEL, MODE_ORDER } from '../lib/theme';

export interface RouteComparisonProps {
  results: Partial<Record<RouteMode, RouteResult>>;
  activeMode: RouteMode;
  onSelectMode: (mode: RouteMode) => void;
}

const STATUS_TEXT: Record<RouteResult['status'], string> = {
  ok: 'Route found',
  out_of_bounds: 'End point is outside the grid',
  blocked_endpoint: 'End point is blocked or unknown',
  no_path: 'No traversable path connects these points',
};

function metres(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${value.toFixed(0)} m`;
}

/** The metric rows, in the order the panel reads them. */
const METRICS: { key: keyof RouteResult; label: string; format: (r: RouteResult) => string }[] = [
  { key: 'distanceMeters', label: 'Distance', format: (r) => metres(r.distanceMeters) },
  { key: 'modeledCost', label: 'Modelled cost', format: (r) => (r.modeledCost ?? 0).toFixed(0) },
  { key: 'meanSlopeDeg', label: 'Mean slope', format: (r) => `${(r.meanSlopeDeg ?? 0).toFixed(1)}°` },
  { key: 'maxSlopeDeg', label: 'Max slope', format: (r) => `${(r.maxSlopeDeg ?? 0).toFixed(1)}°` },
  { key: 'cells', label: 'Cells', format: (r) => String(r.cells) },
  { key: 'computationMs', label: 'Search', format: (r) => `${r.computationMs.toFixed(0)} ms` },
];

export function RouteComparison({ results, activeMode, onSelectMode }: RouteComparisonProps) {
  if (MODE_ORDER.every((mode) => !results[mode])) {
    return (
      <p className="panel__note">
        Place a start and an end point, then calculate a route to compare the two modes.
      </p>
    );
  }

  return (
    <div className="compare">
      {MODE_ORDER.map((mode) => {
        const result = results[mode];
        const isActive = mode === activeMode;
        return (
          <article
            key={mode}
            className={`card card--${mode === 'shortest' ? 'shortest' : 'terrain'} ${isActive ? 'is-active' : ''}`}
            data-route-mode={mode}
          >
            <button
              type="button"
              className="card__head"
              aria-pressed={isActive}
              onClick={() => onSelectMode(mode)}
            >
              <span
                className="mode__swatch"
                style={{ background: MODE_COLOR[mode] }}
                aria-hidden="true"
              />
              <span className="card__title">{MODE_LABEL[mode]}</span>
              {isActive && <span className="card__badge">shown</span>}
            </button>

            {!result ? (
              <p className="card__error">Not calculated.</p>
            ) : result.status !== 'ok' ? (
              <p className="card__error">{STATUS_TEXT[result.status]}</p>
            ) : (
              <dl className="card__metrics">
                {METRICS.map((m) => (
                  <div key={m.key}>
                    <dt>{m.label}</dt>
                    <dd>{m.format(result)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
    </div>
  );
}

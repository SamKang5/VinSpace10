import type { RouteMode, RouteResult } from '../lib/router';
import { MODE_COLOR, MODE_DASHED, MODE_LABEL, MODE_ORDER } from '../lib/theme';
import type { CSSProperties } from 'react';

export interface RouteComparisonProps {
  results: Partial<Record<RouteMode, RouteResult>>;
  activeMode: RouteMode;
  onSelectMode: (mode: RouteMode) => void;
  status: string;
  resultRevision: number;
  calculating: boolean;
}

const METRICS = [
  { key: 'distanceMeters', label: 'Distance', unit: 'km', scale: 1000, digits: 2 },
  { key: 'modeledCost', label: 'Modelled cost', unit: 'm × index', scale: 1, digits: 1 },
  { key: 'meanSlopeDeg', label: 'Mean slope', unit: '°', scale: 1, digits: 1 },
  { key: 'maxSlopeDeg', label: 'Max slope', unit: '°', scale: 1, digits: 1 },
  { key: 'cells', label: 'Path size', unit: 'cells', scale: 1, digits: 0 },
  { key: 'computationMs', label: 'Search', unit: 'ms', scale: 1, digits: 0 },
] as const;

export function RouteSwatch({ mode }: { mode: RouteMode }) {
  return (
    <svg viewBox="0 0 32 8" width="32" height="8" aria-hidden="true"
      style={{ '--route-colour': MODE_COLOR[mode] } as CSSProperties} className="route-swatch">
      <path d="M0 4h32" fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray={MODE_DASHED[mode] ? '9 6' : undefined} />
    </svg>
  );
}

export function RouteComparison({ results, activeMode, onSelectMode, status, resultRevision, calculating }: RouteComparisonProps) {
  const hasRoute = MODE_ORDER.some((mode) => results[mode]?.status === 'ok');

  return (
    <div className="comparison">
      <p className="comparison__status" role="status">
        {status}
        {!calculating && hasRoute && <span className="sr-only">
          {MODE_ORDER.map((mode) => {
            const result = results[mode];
            return result?.status === 'ok'
              ? '. ' + MODE_LABEL[mode] + ', ' + result.cells + ' cells, modelled cost ' + result.modeledCost?.toFixed(1)
              : '';
          }).join('')}
        </span>}
      </p>
      {hasRoute && (
        <table className="comparison__table" aria-label="Route metrics" key={resultRevision}>
          <colgroup><col /><col /><col /></colgroup>
          <thead>
            <tr>
              <td className="comparison__axis">Map priority</td>
              {MODE_ORDER.map((mode) => (
                <th key={mode} scope="col" data-active={activeMode === mode}
                  style={{ '--route-colour': MODE_COLOR[mode] } as CSSProperties}>
                  <button type="button" className="route-select"
                    aria-pressed={mode === activeMode}
                    aria-disabled={calculating || results[mode]?.status !== 'ok'}
                    aria-label={'Bring ' + MODE_LABEL[mode].toLowerCase() + ' to front'}
                    onClick={() => results[mode]?.status === 'ok' && !calculating && onSelectMode(mode)}>
                    <RouteSwatch mode={mode} />
                    <span>{mode === 'shortest' ? 'Shortest' : 'Terrain-aware'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, label, unit, scale, digits }) => (
              <tr key={key} className={key === 'modeledCost' ? 'comparison__cost' : undefined}>
                <th scope="row">{label}<span className="unit">{unit}</span></th>
                {MODE_ORDER.map((mode) => {
                  const result = results[mode];
                  const value = result?.status === 'ok' ? result[key] : null;
                  return (
                    <td className="number" key={mode} data-active={activeMode === mode}>
                      {value == null ? '—' : (value / scale).toFixed(digits)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasRoute && <p className="sr-only" role="status">
        {MODE_LABEL[activeMode]} in front.
      </p>}
    </div>
  );
}

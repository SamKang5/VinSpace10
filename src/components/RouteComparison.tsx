import type { CSSProperties } from 'react';
import type { RouteMode, RouteResult } from '../lib/router';
import { MODE_COLOR, MODE_DASHED, MODE_ORDER } from '../lib/theme';

interface RouteComparisonProps {
  results: Partial<Record<RouteMode, RouteResult>>;
  activeMode: RouteMode;
  onSelectMode: (mode: RouteMode) => void;
  status: string;
  calculating: boolean;
}

const METRICS = [
  { key: 'distanceMeters', label: 'Distance', unit: 'km', scale: 1000, digits: 2 },
  { key: 'modeledCost', label: 'Modelled cost', unit: 'm × index', scale: 1, digits: 1 },
  { key: 'cells', label: 'Cells', unit: '', scale: 1, digits: 0 },
] as const;

const DETAILS = [
  { key: 'meanSlopeDeg', label: 'Mean slope', unit: '°' },
  { key: 'maxSlopeDeg', label: 'Max slope', unit: '°' },
  { key: 'computationMs', label: 'Search', unit: 'ms' },
] as const;

function RouteSwatch({ mode }: { mode: RouteMode }) {
  return (
    <svg viewBox="0 0 32 8" width="32" height="8" aria-hidden="true" className="route-swatch">
      <path d="M0 4h32" fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray={MODE_DASHED[mode] ? '9 6' : undefined} />
    </svg>
  );
}

function Table({ results, activeMode, onSelectMode, detail }: Omit<RouteComparisonProps, 'status' | 'calculating'> & { detail?: boolean }) {
  return (
    <table className="comparison__table" aria-label={detail ? 'Route details' : 'Route comparison'}>
      <thead>
        <tr>
          <th scope="col">{detail ? 'Route' : <span className="sr-only">Route</span>}</th>
          {(detail ? DETAILS : METRICS).map(({ label, unit }) => (
            <th key={label} scope="col">{label}{unit && <span className="unit">{unit}</span>}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {MODE_ORDER.map((mode) => {
          const result = results[mode];
          const name = mode === 'shortest' ? 'Shortest' : 'Terrain-aware';
          const ready = result?.status === 'ok';
          return (
            <tr key={mode} data-active={mode === activeMode && ready} style={{ '--route-colour': MODE_COLOR[mode] } as CSSProperties}>
              <th scope="row">
                {detail ? name : (
                  <button type="button" className="route-select" disabled={!ready}
                    aria-pressed={mode === activeMode && ready} title={'Bring ' + name.toLowerCase() + ' to front on the map'}
                    onClick={() => onSelectMode(mode)}>
                    <RouteSwatch mode={mode} />{name}
                  </button>
                )}
              </th>
              {detail ? DETAILS.map(({ key }) => (
                <td className="number" key={key}>{ready ? result[key]?.toFixed(key === 'computationMs' ? 0 : 1) ?? '—' : '—'}</td>
              )) : METRICS.map(({ key, scale, digits }) => {
                const value = ready ? result[key] : null;
                return <td className="number" key={key} data-cost={key === 'modeledCost'}>{value == null ? '—' : (value / scale).toFixed(digits)}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RouteComparison({ results, activeMode, onSelectMode, status, calculating }: RouteComparisonProps) {
  const hasRoute = !calculating && MODE_ORDER.some((mode) => results[mode]?.status === 'ok');
  const readyText = MODE_ORDER.flatMap((mode) => {
    const result = results[mode];
    return result?.status === 'ok'
      ? [(mode === 'shortest' ? 'Shortest' : 'Terrain-aware') + ', ' + result.cells + ' cells, modelled cost ' + result.modeledCost?.toFixed(1)]
      : [];
  }).join('. ');

  return (
    <section className="comparison" aria-label="Route results" data-empty={!hasRoute && !status}>
      <p className={hasRoute ? 'sr-only' : 'comparison__status'} role="status">{hasRoute ? readyText : status}</p>
      {hasRoute && <>
        <Table results={results} activeMode={activeMode} onSelectMode={onSelectMode} />
        <details className="comparison__more">
          <summary className="text-action">More metrics</summary>
          <Table results={results} activeMode={activeMode} onSelectMode={onSelectMode} detail />
        </details>
      </>}
    </section>
  );
}

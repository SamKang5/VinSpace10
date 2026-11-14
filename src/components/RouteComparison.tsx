import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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
  { key: 'meanSlopeDeg', label: 'Mean slope', unit: '°', scale: 1, digits: 1 },
  { key: 'maxSlopeDeg', label: 'Max slope', unit: '°', scale: 1, digits: 1 },
  { key: 'computationMs', label: 'Search', unit: 'ms', scale: 1, digits: 0 },
] as const;

function RouteSwatch({ mode }: { mode: RouteMode }) {
  return (
    <svg viewBox="0 0 32 8" width="32" height="8" aria-hidden="true" className="route-swatch">
      <path d="M0 4h32" fill="none" stroke="currentColor" strokeWidth="2"
        strokeDasharray={MODE_DASHED[mode] ? '9 6' : undefined} />
    </svg>
  );
}

function Table({ results, activeMode, onSelectMode, expanded }: Omit<RouteComparisonProps, 'status' | 'calculating'> & { expanded: boolean }) {
  const metrics = expanded ? [...METRICS, ...DETAILS] : METRICS;
  return (
    <table id="route-comparison" className="comparison__table" aria-label="Route comparison" data-expanded={expanded}>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">Route</span></th>
          {metrics.map(({ key, label, unit }, index) => (
            <th key={key} scope="col"><span className="comparison__metric" data-detail={index >= METRICS.length}
              style={{ '--column': index - METRICS.length } as CSSProperties}>
              {label}{unit && <span className="unit">{unit}</span>}
            </span></th>
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
                <button type="button" className="route-select" disabled={!ready}
                  aria-pressed={mode === activeMode && ready} title={'Bring ' + name.toLowerCase() + ' to front on the map'}
                  onClick={() => onSelectMode(mode)}>
                  <RouteSwatch mode={mode} />{name}
                </button>
              </th>
              {metrics.map(({ key, scale, digits }, index) => {
                const value = ready ? result[key] : null;
                return <td className="number" key={key} data-cost={key === 'modeledCost'}>
                  <span className="comparison__metric" data-detail={index >= METRICS.length}
                    style={{ '--column': index - METRICS.length } as CSSProperties}>
                    {value == null ? '—' : (value / scale).toFixed(digits)}
                  </span>
                </td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RouteComparison({ results, activeMode, onSelectMode, status, calculating }: RouteComparisonProps) {
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const previousPositions = useRef(new Map<Element, number>());
  const hasRoute = !calculating && MODE_ORDER.some((mode) => results[mode]?.status === 'ok');
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // ponytail: native FLIP moves existing values without animating table layout or adding a library.
    const animations: Animation[] = [];
    for (const [element, left] of previousPositions.current) {
      if (element.isConnected) animations.push(element.animate([
        { transform: `translateX(${left - element.getBoundingClientRect().left}px)` },
        { transform: 'translateX(0)' },
      ], { duration: expanded ? 280 : 200, easing: 'cubic-bezier(.2,.75,.2,1)' }));
    }
    previousPositions.current.clear();
    const scroll = sectionRef.current?.querySelector('.comparison__scroll');
    scroll?.scrollTo({ left: expanded ? scroll.scrollWidth - scroll.clientWidth : 0, behavior: reducedMotion ? 'instant' : 'smooth' });
    return () => animations.forEach((animation) => animation.cancel());
  }, [expanded, hasRoute]);
  const readyText = MODE_ORDER.flatMap((mode) => {
    const result = results[mode];
    return result?.status === 'ok'
      ? [(mode === 'shortest' ? 'Shortest' : 'Terrain-aware') + ', ' + result.cells + ' cells, modelled cost ' + result.modeledCost?.toFixed(1)]
      : [];
  }).join('. ');

  return (
    <section ref={sectionRef} className="comparison" aria-label="Route results" data-empty={!hasRoute && !status}>
      <p className={hasRoute ? 'sr-only' : 'comparison__status'} role="status">{hasRoute ? readyText : status}</p>
      {hasRoute && <>
        <div className="comparison__scroll" role="region" aria-label="Route metrics" tabIndex={0}>
          <Table results={results} activeMode={activeMode} onSelectMode={onSelectMode} expanded={expanded} />
        </div>
        <button type="button" className="text-action comparison__more" aria-expanded={expanded}
          aria-controls="route-comparison" onClick={() => {
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              sectionRef.current?.querySelectorAll('.comparison__metric[data-detail="false"]').forEach((element) => {
                previousPositions.current.set(element, element.getBoundingClientRect().left);
              });
            }
            setExpanded((current) => !current);
          }}>More metrics</button>
      </>}
    </section>
  );
}

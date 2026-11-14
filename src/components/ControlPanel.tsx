// Navigation control panel (M4-02).
//
// Start and end cells can be typed as `row,column` or placed by clicking the
// map, the mode is chosen here, and the panel reports what the terrain
// overlay is showing.

import type { RouteMode } from '../lib/router';

export interface ControlPanelProps {
  start: [number, number] | null;
  end: [number, number] | null;
  activeMarker: 'A' | 'B';
  onActiveMarkerChange: (marker: 'A' | 'B') => void;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  onCalculate: () => void;
  onClear: () => void;
  onUseExample: () => void;
  showSlopeClasses: boolean;
  onShowSlopeClassesChange: (show: boolean) => void;
  canCalculate: boolean;
}

const MODE_LABEL: Record<RouteMode, string> = {
  shortest: 'Shortest path',
  'terrain-aware': 'Terrain-aware path',
};

const MODE_HINT: Record<RouteMode, string> = {
  shortest: 'Minimises distance, ignores friction.',
  'terrain-aware': 'Minimises distance weighted by ground friction.',
};

export function ControlPanel({
  start,
  end,
  activeMarker,
  onActiveMarkerChange,
  mode,
  onModeChange,
  onCalculate,
  onClear,
  onUseExample,
  showSlopeClasses,
  onShowSlopeClassesChange,
  canCalculate,
}: ControlPanelProps) {
  const active = activeMarker === 'A' ? start : end;

  return (
    <>
      <div className="panel__block">
        <h2 className="panel__heading">Waypoints</h2>
        <div className="panel__markers" role="radiogroup" aria-label="Marker to place">
          {(['A', 'B'] as const).map((slot) => {
            const point = slot === 'A' ? start : end;
            const isActive = activeMarker === slot;
            return (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`chip chip--${slot.toLowerCase()} ${isActive ? 'is-active' : ''}`}
                onClick={() => onActiveMarkerChange(slot)}
              >
                <span className="chip__dot" aria-hidden="true" />
                {slot === 'A' ? 'Start' : 'End'}
                {point ? (
                  <code className="chip__coord">
                    [{point[0]}, {point[1]}]
                  </code>
                ) : (
                  <span className="chip__coord chip__coord--empty">unset</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="panel__note">
          Pick a marker, then click the map to place it. Drag to pan, scroll to zoom.
        </p>
        <div className="panel__row">
          <button type="button" className="btn btn--ghost" onClick={onUseExample}>
            Use the example route
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClear} disabled={!start && !end}>
            Clear
          </button>
        </div>
      </div>

      <div className="panel__block">
        <h2 className="panel__heading">Routing mode</h2>
        <div className="panel__modes" role="radiogroup" aria-label="Routing mode">
          {(['shortest', 'terrain-aware'] as RouteMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={`mode ${mode === m ? 'is-active' : ''}`}
              onClick={() => onModeChange(m)}
            >
              <span className="mode__swatch" style={{ background: MODE_COLOR[m] }} aria-hidden="true" />
              <span>
                {MODE_LABEL[m]}
                <span className="mode__hint">{MODE_HINT[m]}</span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onCalculate}
          disabled={!canCalculate}
        >
          Calculate route
        </button>
        {active && (
          <p className="panel__note">
            Placing the {activeMarker === 'A' ? 'start' : 'end'} point next.
          </p>
        )}
      </div>

      <div className="panel__block">
        <h2 className="panel__heading">Map layers</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSlopeClasses}
            onChange={(event) => onShowSlopeClassesChange(event.target.checked)}
          />
          <span>Show slope classes</span>
        </label>
        <ul className="slope-legend">
          <li>
            <span className="slope-legend__chip slope-legend__chip--s1" aria-hidden="true" />
            5–10°
          </li>
          <li>
            <span className="slope-legend__chip slope-legend__chip--s2" aria-hidden="true" />
            10–15°
          </li>
          <li>
            <span className="slope-legend__chip slope-legend__chip--s3" aria-hidden="true" />
            ≥15° blocked
          </li>
        </ul>
        <p className="panel__note">
          Slope classes are an illustrative research threshold, not safety zones.
        </p>
      </div>
    </>
  );
}

const MODE_COLOR: Record<RouteMode, string> = {
  shortest: '#38bdf8',
  'terrain-aware': '#fbbf24',
};

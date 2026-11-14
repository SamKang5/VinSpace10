// Navigation control panel (M4-02).
//
// Start and end cells can be placed by clicking the map, the mode is chosen
// here, and the layers are toggled here.

import type { RouteMode } from '../lib/router';
import { MARKER_COLOR, MODE_COLOR, MODE_HINT, MODE_LABEL, MODE_ORDER } from '../lib/theme';

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
  showElevation: boolean;
  onShowElevationChange: (show: boolean) => void;
  canCalculate: boolean;
}

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
  showElevation,
  onShowElevationChange,
  canCalculate,
}: ControlPanelProps) {
  return (
    <>
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
              <span
                className="chip__dot"
                style={{ background: MARKER_COLOR[slot] }}
                aria-hidden="true"
              />
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
        <button type="button" className="btn btn--ghost btn--sm" onClick={onUseExample}>
          Use the example route
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onClear}
          disabled={!start && !end}
        >
          Clear
        </button>
      </div>

      <div className="panel__modes" role="radiogroup" aria-label="Routing mode">
        {MODE_ORDER.map((m) => (
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

      <div className="panel__layers">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showElevation}
            onChange={(event) => onShowElevationChange(event.target.checked)}
          />
          <span>Elevation tint</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSlopeClasses}
            onChange={(event) => onShowSlopeClassesChange(event.target.checked)}
          />
          <span>Slope classes</span>
        </label>
      </div>
    </>
  );
}

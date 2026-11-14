import type { GridPoint } from '../lib/router';
import type { MarkerSlot } from './MapViewer';

export interface ControlPanelProps {
  start: GridPoint | null;
  end: GridPoint | null;
  activeMarker: MarkerSlot | null;
  onActiveMarkerChange: (marker: MarkerSlot) => void;
  onCalculate: () => void;
  onClear: () => void;
  onUseExample: () => void;
  showSlopeClasses: boolean;
  onShowSlopeClassesChange: (show: boolean) => void;
  showElevation: boolean;
  onShowElevationChange: (show: boolean) => void;
  canCalculate: boolean;
  calculating: boolean;
  excluded: Record<MarkerSlot, 'Blocked' | 'Unknown' | null>;
  status: string;
}

export function ControlPanel({
  start, end, activeMarker, onActiveMarkerChange, onCalculate, onClear, onUseExample,
  showSlopeClasses, onShowSlopeClassesChange, showElevation, onShowElevationChange,
  canCalculate, calculating, excluded, status,
}: ControlPanelProps) {
  return (
    <div className="controls">
      <div className="endpoints" role="group" aria-label="Endpoint to place">
        {(['A', 'B'] as const).map((slot) => {
          const point = slot === 'A' ? start : end;
          const exclusion = excluded[slot];
          return (
            <button key={slot} type="button" className="endpoint" aria-pressed={activeMarker === slot}
              aria-invalid={exclusion ? true : undefined} onClick={() => onActiveMarkerChange(slot)}>
              <span className="endpoint__letter" aria-hidden="true">{slot}</span>
              <span>
                <span className="endpoint__name">{slot === 'A' ? 'Start' : 'End'}</span>
                <span className="endpoint__coord">
                  {point ? <span className="number">[{point[0]}, {point[1]}]</span> : 'Unset'}
                  {exclusion && <span className="warning"> · {exclusion}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={'control-status' + (Object.values(excluded).some(Boolean) ? ' warning' : '')} role="status">
        {status}
      </p>
      <div className="actions">
        <button type="button" className="btn btn--primary" aria-disabled={!canCalculate || calculating}
          onClick={onCalculate}>{calculating ? 'Calculating…' : 'Calculate routes'}</button>
        <button type="button" className="btn" onClick={onUseExample}>D08 example</button>
        <button type="button" className="btn" aria-disabled={!start && !end} onClick={onClear}>Clear</button>
      </div>
      <div className="overlays" role="group" aria-label="Terrain overlays">
        <label><input type="checkbox" checked={showSlopeClasses}
          onChange={(event) => onShowSlopeClassesChange(event.target.checked)} />Slope classes</label>
        <label><input type="checkbox" checked={showElevation}
          onChange={(event) => onShowElevationChange(event.target.checked)} />Elevation tint</label>
      </div>
    </div>
  );
}

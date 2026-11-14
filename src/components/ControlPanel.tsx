import type { CSSProperties } from 'react';
import type { GridPoint } from '../lib/router';
import { MARKER_COLOR } from '../lib/theme';
import type { MarkerSlot } from './MapViewer';

interface ControlPanelProps {
  start: GridPoint | null;
  end: GridPoint | null;
  activeMarker: MarkerSlot | null;
  onActiveMarkerChange: (marker: MarkerSlot) => void;
  onClear: () => void;
  status: string;
  error: string | null;
}

export function ControlPanel({ start, end, activeMarker, onActiveMarkerChange, onClear, status, error }: ControlPanelProps) {
  return (
    <div className="route-builder">
      <div className="route-builder__tools" role="group" aria-label="Route endpoints">
        {(['A', 'B'] as const).map((slot) => {
          const point = slot === 'A' ? start : end;
          const label = slot === 'A' ? 'Start' : 'End';
          return (
            <button key={slot} type="button" className="endpoint" aria-pressed={activeMarker === slot}
              aria-label={label + ' ' + slot + (point ? ', cell ' + point.join(', ') : ', unset')}
              style={{ '--pin': MARKER_COLOR[slot] } as CSSProperties}
              onClick={() => onActiveMarkerChange(slot)}>
              <span className="endpoint__letter" aria-hidden="true">{slot}</span>
              <span>{label}</span>
            </button>
          );
        })}
        {(start || end) && <button type="button" className="btn route-builder__reset" onClick={onClear}>
          {start && end ? 'New route' : 'Clear'}
        </button>}
      </div>
      <p className={'route-builder__status' + (error ? ' warning' : '')} role="status">{error ?? status}</p>
    </div>
  );
}

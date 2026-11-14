import type { FormEvent, MouseEvent } from 'react';
import type { GridPoint } from '../lib/router';

export interface TerrainInfoPanelProps {
  cell: GridPoint | null;
  projected: { x: number; y: number } | null;
  elevation: number | null;
  slope: number | null;
  cost: number | null;
  slopeClass: string | null;
  excluded: 'Blocked' | 'Unknown' | null;
  endpoint: string | null;
  size: { width: number; height: number };
  activeMarker: 'A' | 'B' | null;
  onInspect: (cell: GridPoint, place: boolean) => void;
  inspectionStatus: string;
}

export function TerrainInfoPanel({
  cell, projected, elevation, slope, cost, slopeClass, excluded, endpoint, size, activeMarker,
  onInspect, inspectionStatus,
}: TerrainInfoPanelProps) {
  const value = (numeric: number | null, digits: number, unit: string) => (
    <>
      <span className="number">{numeric == null ? '—' : numeric.toFixed(digits).replace('-', '−')}</span>
      <span className="unit">{unit}</span>
    </>
  );

  const readCell = (form: HTMLFormElement, place: boolean) => {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    onInspect([Number(data.get('row')), Number(data.get('column'))], place);
  };
  const inspect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    readCell(event.currentTarget, false);
  };
  const place = (event: MouseEvent<HTMLButtonElement>) => {
    if (activeMarker && event.currentTarget.form) readCell(event.currentTarget.form, true);
  };

  return (
    <div className="inspector">
      <div className="inspector__position">
        {cell ? <>
          <span>Cell <span className="number">[{cell.join(', ')}]</span></span>
          <span className={excluded ? 'warning' : undefined}>{excluded ?? 'Included in model'}{endpoint ? ' · ' + endpoint : ''}</span>
        </> : <span>Hover or tap the map, or enter a cell below.</span>}
      </div>
      <dl className="inspector__readings">
        <div><dt>Elev</dt><dd>{value(elevation, 1, 'm')}</dd></div>
        <div><dt>Slope</dt><dd>{value(slope, 1, '°')}</dd></div>
        <div><dt>Friction</dt><dd>{value(cost, 2, 'index')}</dd></div>
      </dl>
      <dl className="inspector__details">
        <div><dt>Slope class</dt><dd className="number">{slopeClass ?? '—'}</dd></div>
        <div><dt>Easting</dt><dd>{value(projected?.x ?? null, 2, 'm')}</dd></div>
        <div><dt>Northing</dt><dd>{value(projected?.y ?? null, 2, 'm')}</dd></div>
      </dl>
      <form className="cell-form" onSubmit={inspect} aria-label="Inspect by grid cell">
        <div>
          <label>Row<input type="number" name="row" required min="0" max={size.height - 1} step="1" inputMode="numeric" /></label>
          <label>Column<input type="number" name="column" required min="0" max={size.width - 1} step="1" inputMode="numeric" /></label>
        </div>
        <div>
          <button className="btn" type="submit">Inspect cell</button>
          <button className="btn" type="button" aria-disabled={!activeMarker} onClick={place}>
            {activeMarker ? 'Place ' + activeMarker + ' here' : 'Place endpoint here'}
          </button>
        </div>
      </form>
      <span className="sr-only" role="status">{inspectionStatus}</span>
    </div>
  );
}

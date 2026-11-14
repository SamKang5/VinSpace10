// Terrain info card (R03).
//
// Shows what is under the cursor: the grid cell, its projected coordinates,
// the elevation, the slope and the friction index the router uses.
//
// The panel is presentational and takes every value as a prop, so it can be
// reused with mock data. It never says a cell is safe: the slope classes are
// an illustrative research threshold.

export interface TerrainInfoValues {
  /** Grid cell as [row, col], or null when the cursor is off the grid. */
  cell: [number, number] | null;
  /** Projected easting and northing in metres. */
  projected: { x: number; y: number } | null;
  /** Elevation in metres. */
  elevation: number | null;
  /** Slope in degrees. */
  slope: number | null;
  /** Dimensionless friction index. */
  cost: number | null;
  /** The D07 slope class of the cell. */
  slopeClass: string | null;
  /** True when the cell is excluded from routing. */
  blocked: boolean;
}

export interface TerrainInfoPanelProps extends TerrainInfoValues {
  /** Marks the cell as an endpoint of the route being drawn. */
  endpoint?: 'A' | 'B' | null;
}

export function TerrainInfoPanel({
  cell,
  projected,
  elevation,
  slope,
  cost,
  slopeClass,
  blocked,
  endpoint,
}: TerrainInfoPanelProps) {
  if (!cell) {
    return (
      <div className="terrain-info">
        <h3 className="legend__title">Terrain info</h3>
        <p className="terrain-info__empty">Hover the map to inspect a cell.</p>
      </div>
    );
  }

  return (
    <div className="terrain-info">
      <h3 className="legend__title">
        Terrain info
        {endpoint ? <span className="terrain-info__badge">Endpoint {endpoint}</span> : null}
      </h3>
      <dl className="terrain-info__grid">
        <div>
          <dt>Cell</dt>
          <dd>
            [{cell[0]}, {cell[1]}]
          </dd>
        </div>
        <div>
          <dt>East / north</dt>
          <dd>
            {projected ? `${projected.x.toFixed(0)} / ${projected.y.toFixed(0)}` : '—'}
            <span className="terrain-info__unit">m</span>
          </dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>
            {elevation === null ? '—' : elevation.toFixed(1)}
            <span className="terrain-info__unit">m</span>
          </dd>
        </div>
        <div>
          <dt>Slope</dt>
          <dd>
            {slope === null ? '—' : slope.toFixed(1)}
            <span className="terrain-info__unit">°</span>
          </dd>
        </div>
        <div>
          <dt>Friction</dt>
          <dd>{cost === null ? '—' : cost.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd className={blocked ? 'is-blocked' : undefined}>{slopeClass ?? '—'}</dd>
        </div>
      </dl>
      {blocked ? (
        <p className="terrain-info__note terrain-info__note--blocked">
          Excluded from routing: the slope is 15° or more.
        </p>
      ) : (
        <p className="terrain-info__note">
          Friction is a dimensionless slope-derived index, not energy or speed.
        </p>
      )}
    </div>
  );
}

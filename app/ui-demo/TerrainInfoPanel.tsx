// Compatibility rewrite matching src/components/TerrainInfoPanel.tsx props.

export interface TerrainInfoValues {
  cell: [number, number] | null;
  projected: { x: number; y: number } | null;
  elevation: number | null;
  slope: number | null;
  cost: number | null;
  slopeClass: string | null;
  blocked: boolean;
}

export interface TerrainInfoPanelProps extends TerrainInfoValues {
  endpoint?: "A" | "B" | null;
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
          <dd>[{cell[0]}, {cell[1]}]</dd>
        </div>
        <div>
          <dt>East / north</dt>
          <dd>{projected ? `${projected.x.toFixed(0)} / ${projected.y.toFixed(0)}` : "—"}<span className="terrain-info__unit">m</span></dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>{elevation === null ? "—" : elevation.toFixed(1)}<span className="terrain-info__unit">m</span></dd>
        </div>
        <div>
          <dt>Slope</dt>
          <dd>{slope === null ? "—" : slope.toFixed(1)}<span className="terrain-info__unit">°</span></dd>
        </div>
        <div>
          <dt>Friction</dt>
          <dd>{cost === null ? "—" : cost.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd className={blocked ? "is-blocked" : undefined}>{slopeClass ?? "—"}</dd>
        </div>
      </dl>
      {blocked ? (
        <p className="terrain-info__note terrain-info__note--blocked">Excluded from routing: the slope is 15° or more.</p>
      ) : (
        <p className="terrain-info__note">Friction is a dimensionless slope-derived index, not energy or speed.</p>
      )}
    </div>
  );
}

export default TerrainInfoPanel;

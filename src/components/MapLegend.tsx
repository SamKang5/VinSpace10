import { elevationGradientCss, SLOPE_CLASS_LABELS, SLOPE_SWATCHES, type SlopeClass } from '../lib/overlay';

const count = new Intl.NumberFormat('en');

export interface MapLegendProps {
  elevation: { min: number; max: number };
  counts: number[];
  statistics: { supported: number; total: number; unknown: number; blocked: number; finiteCost: number };
  metresPerPixel: number;
  areaKm: number;
}

export function MapLegend({ elevation, counts, statistics, metresPerPixel, areaKm }: MapLegendProps) {
  const formatElevation = (value: number) => value.toFixed(2).replace('-', '−');

  return (
    <div className="legend">
      <p>CTX orthomosaic crop · <span className="number">{metresPerPixel.toFixed(3)}</span> m/px</p>
      <p>Mars 2000 sphere · Equirectangular · <span className="number">{areaKm.toFixed(2)} × {areaKm.toFixed(2)}</span> km projected</p>
      <h3>Elevation tint</h3>
      <div className="legend__ramp" style={{ background: elevationGradientCss() }} aria-hidden="true" />
      <div className="legend__range">
        <span><span className="number">{formatElevation(elevation.min)}</span> m</span>
        <span><span className="number">{formatElevation(elevation.max)}</span> m</span>
      </div>
      <h3>Slope classes</h3>
      <ul>
        {SLOPE_SWATCHES.map((color, idx) => (
          <li key={idx}>
            <span className="legend__swatch" style={{ backgroundColor: color }} aria-hidden="true" />
            <span>{SLOPE_CLASS_LABELS[idx as SlopeClass]}{idx === 3 ? ' · Blocked' : idx === 0 ? ' · Clear tint' : ''}</span>
            <span className="number">{count.format(counts[idx])} <span className="unit">cells</span></span>
          </li>
        ))}
      </ul>
      <p><span className="number">{count.format(statistics.supported)}</span> of <span className="number">{count.format(statistics.total)}</span> cells supported · <span className="number">{count.format(statistics.unknown)}</span> unknown</p>
      <p><span className="number">{count.format(statistics.finiteCost)}</span> included · <span className="number">{count.format(statistics.blocked)}</span> blocked</p>
    </div>
  );
}

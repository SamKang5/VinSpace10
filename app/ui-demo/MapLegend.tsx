// Compatibility rewrite of the E UI demo MapLegend.
//
// Props match src/components/MapLegend.tsx of the old (VinSpaceTestingClone)
// project so this component can be dropped in without changing the original.

// When dropped into the old project (src/components/), this resolves to src/lib/overlay.
import { elevationGradientCss } from "../lib/overlay";

export interface MapLegendProps {
  elevation: { min: number; max: number; unit: string };
  slopeClasses: { label: string; color: string }[];
  costPolicy: string;
  traversability: { traversable: number; blocked: number; total: number };
}

export function MapLegend({ elevation, slopeClasses, costPolicy, traversability }: MapLegendProps) {
  const blockedPct = ((traversability.blocked / traversability.total) * 100).toFixed(1);
  return (
    <div className="legend">
      <h3 className="legend__title">Legend</h3>
      <section className="legend__group">
        <h4 className="legend__label">Basemap</h4>
        <p className="legend__text">CTX orthomosaic, 6 m/px, NASA/USGS Jezero crater western fan.</p>
      </section>
      <section className="legend__group">
        <h4 className="legend__label">Elevation</h4>
        <div className="legend__ramp" style={{ background: elevationGradientCss() }} aria-hidden="true" />
        <p className="legend__text">
          {elevation.min.toFixed(1)} to {elevation.max.toFixed(1)} {elevation.unit}, relative to the Mars 2000 datum.
        </p>
      </section>
      <section className="legend__group">
        <h4 className="legend__label">Slope classes</h4>
        <ul className="legend__items">
          {slopeClasses.map((c) => (
            <li key={c.label}>
              <span className="legend__swatch" style={{ background: c.color }} aria-hidden="true" />
              {c.label}
            </li>
          ))}
        </ul>
      </section>
      <section className="legend__group">
        <h4 className="legend__label">Movement cost</h4>
        <p className="legend__text">{costPolicy}</p>
      </section>
      <section className="legend__group">
        <h4 className="legend__label">Traversability</h4>
        <p className="legend__text">
          {traversability.traversable.toLocaleString()} of {traversability.total.toLocaleString()} cells open for routing;{" "}
          {traversability.blocked.toLocaleString()} blocked ({blockedPct}%).
        </p>
      </section>
    </div>
  );
}

export default MapLegend;

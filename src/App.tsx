import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapViewer, type MarkerSlot } from './components/MapViewer';
import { ControlPanel } from './components/ControlPanel';
import { RouteComparison } from './components/RouteComparison';
import { MapLegend } from './components/MapLegend';
import { TerrainInfoPanel } from './components/TerrainInfoPanel';
import { HowToModal } from './components/HowToModal';
import { Block } from './components/Block';
import { loadAppData, type AppData } from './lib/data';
import {
  buildElevationOverlay,
  buildSlopeOverlay,
  slopeClassOf,
  SLOPE_CLASS_LABELS,
  type SlopeClass,
} from './lib/overlay';
import { cellToProjected } from './lib/geo';
import { NODATA, route, type GridPoint, type RouteMode, type RouteResult } from './lib/router';
import { MODE_COLOR, MODE_DASHED, MODE_LABEL } from './lib/theme';

/** The D08 example pair: a long traverse across the western fan. */
const EXAMPLE_START: GridPoint = [230, 30];
const EXAMPLE_END: GridPoint = [35, 235];

/** The legend swatches, in class order. */
const LEGEND_CLASS_COLORS = [
  'rgba(230, 195, 90, 0.55)',
  'rgba(242, 132, 59, 0.7)',
  'rgba(242, 68, 45, 0.85)',
];

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<GridPoint | null>(null);
  const [end, setEnd] = useState<GridPoint | null>(null);
  const [activeMarker, setActiveMarker] = useState<MarkerSlot>('A');
  const [mode, setMode] = useState<RouteMode>('shortest');
  const [results, setResults] = useState<Partial<Record<RouteMode, RouteResult>>>({});
  const [showSlopeClasses, setShowSlopeClasses] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [hovered, setHovered] = useState<GridPoint | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  // ---- data loading --------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    loadAppData(controller.signal)
      .then(setData)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, []);

  const slopeOverlay = useMemo(
    () => (data ? buildSlopeOverlay(data.routing.width, data.routing.height, data.hazard) : null),
    [data],
  );

  const elevationOverlay = useMemo(
    () =>
      data
        ? buildElevationOverlay(
            data.routing.width,
            data.routing.height,
            data.elevation,
            data.overlay.elevation.min,
            data.overlay.elevation.max,
          )
        : null,
    [data],
  );

  /** What is under the cursor, read from the rasters the app already holds. */
  const hoveredInfo = useMemo(() => {
    if (!data || !hovered) return null;
    const index = hovered[0] * data.routing.width + hovered[1];
    const cost = data.routing.cost[index];
    const blocked = cost === NODATA;
    const slope = blocked ? null : data.routing.slope[index];
    return {
      cell: hovered as [number, number],
      projected: cellToProjected(hovered[0], hovered[1]),
      elevation: data.elevation[index],
      slope,
      cost: blocked ? null : cost,
      slopeClass: SLOPE_CLASS_LABELS[slopeClassOf(slope ?? Number.NaN)],
      blocked,
      endpoint:
        (start && start[0] === hovered[0] && start[1] === hovered[1]
          ? 'A'
          : end && end[0] === hovered[0] && end[1] === hovered[1]
            ? 'B'
            : null) as 'A' | 'B' | null,
    };
  }, [data, hovered, start, end]);

  // ---- routing -------------------------------------------------------------
  const calculate = useCallback(() => {
    if (!data || !start || !end) return;
    setResults({
      shortest: route(data.routing, start, end, 'shortest'),
      'terrain-aware': route(data.routing, start, end, 'terrain-aware'),
    });
  }, [data, start, end]);

  const handleMapClick = useCallback(
    (point: GridPoint) => {
      if (activeMarker === 'A') {
        setStart(point);
        setActiveMarker('B');
      } else {
        setEnd(point);
        setActiveMarker('A');
      }
      setResults({});
    },
    [activeMarker],
  );

  const useExample = useCallback(() => {
    setStart(EXAMPLE_START);
    setEnd(EXAMPLE_END);
    setActiveMarker('A');
    setResults({});
  }, []);

  const clear = useCallback(() => {
    setStart(null);
    setEnd(null);
    setResults({});
  }, []);

  // Both modes are drawn; the selected one draws on top.
  const paths = useMemo(() => {
    return (['shortest', 'terrain-aware'] as RouteMode[])
      .map((m) => {
        const result = results[m];
        if (!result || result.status !== 'ok') return null;
        return {
          id: m,
          label: MODE_LABEL[m],
          points: result.path,
          color: MODE_COLOR[m],
          active: m === mode,
          dashed: MODE_DASHED[m],
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [results, mode]);

  // The markers must keep their identity, or every render redraws the canvas.
  const markers = useMemo(
    () => ({ A: start ?? undefined, B: end ?? undefined }),
    [start, end],
  );

  // ---- render --------------------------------------------------------------
  if (error) {
    return (
      <div className="app app--error">
        <p className="app__error">Could not load the terrain data: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app app--loading">
        <p>Loading Jezero terrain…</p>
      </div>
    );
  }

  const { metadata } = data;

  return (
    <div className="app">
      <header className="app__head">
        <div className="app__brand">
          <h1 className="app__title">
            MARS <b>NAVIGATOR</b>
          </h1>
          <p className="app__sub">Jezero crater western fan</p>
        </div>
        <div className="app__head-spacer" />
        <dl className="app__stats">
          <div>
            <dt>Grid</dt>
            <dd>
              {metadata.width}×{metadata.height}
            </dd>
          </div>
          <div>
            <dt>Cell</dt>
            <dd>{metadata.resolutionProjectedMeters[0]} m</dd>
          </div>
          <div>
            <dt>Blocked</dt>
            <dd>{metadata.statistics.blocked.toLocaleString()}</dd>
          </div>
          <div>
            <dt>CRS</dt>
            <dd>Mars 2000</dd>
          </div>
        </dl>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHowToOpen(true)}>
          How to use
        </button>
      </header>

      <main className="app__body">
        {/* A div, not a section: the kit styles `main > section` as a full-height
            page section, which would size the map to the viewport height. */}
        <div className="app__map">
          <MapViewer
            meta={data.meta}
            imageUrl={`${import.meta.env.BASE_URL}terrain/${data.meta.image}`}
            markers={markers}
            paths={paths}
            activeMarker={activeMarker}
            onMapClick={handleMapClick}
            onHover={setHovered}
            slopeOverlay={slopeOverlay}
            elevationOverlay={elevationOverlay}
            showSlopeClasses={showSlopeClasses}
            showElevation={showElevation}
          />
        </div>

        <aside className="app__rail" aria-label="Route tools">
          <Block title="Route endpoints" defaultOpen>
            <ControlPanel
              start={start}
              end={end}
              activeMarker={activeMarker}
              onActiveMarkerChange={setActiveMarker}
              mode={mode}
              onModeChange={setMode}
              onCalculate={calculate}
              onClear={clear}
              onUseExample={useExample}
              showSlopeClasses={showSlopeClasses}
              onShowSlopeClassesChange={setShowSlopeClasses}
              showElevation={showElevation}
              onShowElevationChange={setShowElevation}
              canCalculate={Boolean(start && end)}
            />
          </Block>

          <Block title="Comparison" defaultOpen>
            <RouteComparison results={results} activeMode={mode} onSelectMode={setMode} />
          </Block>

          <Block title="Terrain info" defaultOpen>
            <TerrainInfoPanel
              cell={hoveredInfo?.cell ?? null}
              projected={hoveredInfo?.projected ?? null}
              elevation={hoveredInfo?.elevation ?? null}
              slope={hoveredInfo?.slope ?? null}
              cost={hoveredInfo?.cost ?? null}
              slopeClass={hoveredInfo?.slopeClass ?? null}
              blocked={hoveredInfo?.blocked ?? false}
              endpoint={hoveredInfo?.endpoint ?? null}
            />
          </Block>

          <Block title="Legend">
            <MapLegend
              elevation={{
                min: data.overlay.elevation.min,
                max: data.overlay.elevation.max,
                unit: data.overlay.elevation.unit,
              }}
              slopeClasses={LEGEND_CLASS_COLORS.map((color, i) => ({
                label: SLOPE_CLASS_LABELS[(i + 1) as SlopeClass],
                color,
              }))}
              costPolicy="Friction index = 1 + (slope ÷ 10)². The terrain-aware route minimises distance weighted by this index."
              traversability={{
                traversable: metadata.statistics.finiteCost,
                blocked: metadata.statistics.blocked,
                total: metadata.statistics.total,
              }}
            />
          </Block>

          <section className="block">
            <div className="block__body">
              <p className="panel__note">
                Research prototype. Friction is a dimensionless slope-derived index
                (1 + (slope/10)²), not energy, speed or safety. Cells at 15° or more are
                excluded from routing in both modes. Routes do not establish real
                traversability.
              </p>
            </div>
          </section>
        </aside>
      </main>

      <HowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  );
}

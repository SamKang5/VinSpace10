import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { HowToModal } from './components/HowToModal';
import { Icon } from './components/Icon';
import { MapLegend } from './components/MapLegend';
import { MapViewer, type MarkerSlot } from './components/MapViewer';
import { RouteComparison } from './components/RouteComparison';
import { TerrainInfoPanel } from './components/TerrainInfoPanel';
import { loadAppData, type AppData } from './lib/data';
import { cellToProjected } from './lib/geo';
import { buildElevationOverlay, buildSlopeOverlay, SLOPE_CLASS_LABELS, type SlopeClass } from './lib/overlay';
import { NODATA, route, type GridPoint, type RouteMode, type RouteResult } from './lib/router';
import { MODE_COLOR, MODE_DASHED, MODE_ORDER } from './lib/theme';

const EXAMPLE_START: GridPoint = [230, 30];
const EXAMPLE_END: GridPoint = [35, 235];

type Results = Partial<Record<RouteMode, RouteResult>>;

function compareRoutes(data: AppData, start: GridPoint, end: GridPoint): Results {
  return {
    shortest: route(data.routing, start, end, 'shortest'),
    'terrain-aware': route(data.routing, start, end, 'terrain-aware'),
  };
}

function readCell(data: AppData, [row, col]: GridPoint) {
  const index = row * data.routing.width + col;
  const cost = data.routing.cost[index];
  const hazard = data.hazard[index];
  const excluded = data.routing.mask[index] !== 1 ? 'Unknown' : cost === NODATA ? 'Blocked' : null;
  return {
    projected: cellToProjected(row, col),
    elevation: Number.isFinite(data.elevation[index]) ? data.elevation[index] : null,
    slope: excluded ? null : data.routing.slope[index],
    cost: excluded ? null : cost,
    slopeClass: hazard <= 3 ? SLOPE_CLASS_LABELS[hazard as SlopeClass] : null,
    excluded,
  } as const;
}

function matches(a: GridPoint | null, b: GridPoint | null) {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);
}

export default function App() {
  const [loaded, setLoaded] = useState<{ data: AppData; image: HTMLImageElement } | null>(null);
  const [loadStatus, setLoadStatus] = useState('Loading navigation grid and terrain rasters…');
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [start, setStart] = useState<GridPoint | null>(null);
  const [end, setEnd] = useState<GridPoint | null>(null);
  const [activeMarker, setActiveMarker] = useState<MarkerSlot | null>(null);
  const [mode, setMode] = useState<RouteMode>('shortest');
  const [results, setResults] = useState<Results>({});
  const [calculating, setCalculating] = useState(false);
  const [showSlopeClasses, setShowSlopeClasses] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [hovered, setHovered] = useState<GridPoint | null>(null);
  const [inspected, setInspected] = useState<GridPoint | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  const layers = useRef<HTMLDetailsElement>(null);
  const mapCanvas = useRef<HTMLCanvasElement>(null);

  const data = loaded?.data ?? null;

  useEffect(() => {
    if (inspectorOpen) inspectorClose.current?.focus({ preventScroll: true });
  }, [inspectorOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let imageUrl: string | null = null;
    const load = async () => {
      const nextData = await loadAppData(controller.signal);
      if (controller.signal.aborted) return;
      setLoadStatus('Decoding CTX orthomosaic…');

      const image = new Image();
      imageUrl = URL.createObjectURL(new Blob([nextData.imageBytes], { type: 'image/png' }));
      image.src = imageUrl;
      try {
        await image.decode();
      } catch {
        throw new Error('The CTX orthomosaic could not be loaded or decoded.');
      }
      if (controller.signal.aborted) return;
      setStart(EXAMPLE_START);
      setEnd(EXAMPLE_END);
      setCalculating(true);
      setLoaded({ data: nextData, image });
    };
    load().catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      controller.abort();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [loadAttempt]);

  const slopeOverlay = useMemo(
    () => data && buildSlopeOverlay(data.routing.width, data.routing.height, data.hazard),
    [data],
  );
  const elevationOverlay = useMemo(
    () => data && buildElevationOverlay(
      data.routing.width, data.routing.height, data.elevation, data.overlay.elevation.min, data.overlay.elevation.max,
    ),
    [data],
  );

  const cell = hovered ?? inspected;
  const cellInfo = data && cell ? readCell(data, cell) : null;
  const endpoint = cell && [matches(cell, start) && 'A', matches(cell, end) && 'B'].filter(Boolean).join(' + ');
  const onHover = useCallback((point: GridPoint | null) => {
    setHovered((previous) => matches(previous, point) ? previous : point);
  }, []);

  useEffect(() => {
    if (!calculating || !data || !start || !end) return;
    let timeout = 0;
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        const nextResults = compareRoutes(data, start, end);
        setResults(nextResults);
        setMode((current) => nextResults[current]?.status === 'ok'
          ? current : MODE_ORDER.find((key) => nextResults[key]?.status === 'ok') ?? current);
        setCalculating(false);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [calculating, data, start, end]);

  const handleMapClick = useCallback((point: GridPoint, slot: MarkerSlot | null = activeMarker) => {
    if (!data) return;
    setInspected(point);
    setHovered(null);
    if (!slot) return;
    const excluded = readCell(data, point).excluded;
    if (excluded) {
      setPlacementError(excluded === 'Blocked'
        ? slot + ' needs a cell below 15°.'
        : 'No terrain data here. Move ' + slot + ' to another cell.');
      return;
    }
    setPlacementError(null);
    if (matches(point, slot === 'A' ? start : end)) {
      if (activeMarker === slot && start && end) setActiveMarker(null);
      return;
    }
    if (slot === 'A') setStart(point);
    else setEnd(point);
    setResults({});
    setCalculating(slot === 'A' ? Boolean(end) : Boolean(start));
    setActiveMarker(slot === 'A' && !end ? 'B' : slot === 'B' && !start ? 'A' : null);
  }, [data, activeMarker, end, start]);

  const inspect = useCallback((point: GridPoint, place: boolean) => {
    if (place) {
      handleMapClick(point);
      return;
    }
    setHovered(null);
    setInspected(point);
  }, [handleMapClick]);

  const clear = () => {
    if (!start && !end) return;
    setStart(null);
    setEnd(null);
    setActiveMarker('A');
    setResults({});
    setPlacementError(null);
    setCalculating(false);
    mapCanvas.current?.focus({ preventScroll: true });
  };

  const paths = useMemo(() => MODE_ORDER.flatMap((key) => {
    const result = results[key];
    return result?.status === 'ok' ? [{
      id: key, points: result.path, color: MODE_COLOR[key], active: key === mode, dashed: MODE_DASHED[key],
    }] : [];
  }), [results, mode]);
  const markers = useMemo(() => ({ A: start ?? undefined, B: end ?? undefined }), [start, end]);

  const routeFailure = MODE_ORDER.map((key) => results[key]?.status).find((status) => status && status !== 'ok');
  const controlStatus = activeMarker ? 'Pick a spot for ' + activeMarker + ' on the map.' : 'Drag either pin to move it.';
  const comparisonStatus = calculating ? 'Finding routes…'
    : routeFailure === 'out_of_bounds' ? 'An endpoint is outside the grid.'
    : routeFailure === 'blocked_endpoint' ? 'An endpoint is excluded from routing.'
    : routeFailure === 'no_path' ? 'No route connects these points. Move either pin.'
    : '';

  const closeInspector = () => {
    setInspectorOpen(false);
    inspectorToggle.current?.focus();
  };

  const selectedInfo = data && inspected ? readCell(data, inspected) : null;
  const inspectionStatus = selectedInfo && inspected
    ? 'Cell ' + inspected[0] + ', ' + inspected[1] + '. ' + (selectedInfo.excluded ?? 'Included in model') +
      '. Elevation ' + (selectedInfo.elevation === null ? 'unavailable' : selectedInfo.elevation.toFixed(1) + ' metres') +
      '. Slope ' + (selectedInfo.slope === null ? 'unavailable' : selectedInfo.slope.toFixed(1) + ' degrees') +
      '. Friction index ' + (selectedInfo.cost?.toFixed(2) ?? 'unavailable') + '.'
    : '';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to map</a>
      <header className="app__head">
        <div className="app__brand">
          <h1>Mars Navigator</h1>
          <p>Jezero Crater</p>
        </div>
        <div className="app__tools">
          {data && <>
            <details className="layers" ref={layers} onToggle={(event) => {
              if (event.currentTarget.open) setInspectorOpen(false);
            }} onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}>
              <summary className="text-action">Layers</summary>
              <div className="layers__panel">
                <div className="overlays" role="group" aria-label="Terrain overlays">
                  <label><input type="checkbox" checked={showSlopeClasses}
                    onChange={(event) => setShowSlopeClasses(event.target.checked)} />Slope classes</label>
                  <label><input type="checkbox" checked={showElevation}
                    onChange={(event) => setShowElevation(event.target.checked)} />Elevation tint</label>
                </div>
                <MapLegend elevation={data.overlay.elevation} counts={data.overlay.hazard.counts}
                  statistics={data.metadata.statistics} metresPerPixel={data.meta.metersPerPx}
                  areaKm={data.metadata.width * data.metadata.resolutionProjectedMeters[0] / 1000} />
                <footer className="provenance">
                  <p>Research prototype. Friction is an uncalibrated, dimensionless slope index
                    <span className="number"> 1 + (slope in degrees ÷ 10)²</span>. It does not measure energy, speed or safety.
                    Both modes exclude cells at 15° or steeper. Physical image-to-DEM registration and the DEM vertical datum remain unresolved.</p>
                  <a href="https://doi.org/10.5066/P9GV1ND3">Terrain source · NASA / USGS</a>
                </footer>
              </div>
            </details>
            <button type="button" className="text-action" ref={inspectorToggle}
              aria-expanded={inspectorOpen} aria-controls="cell-inspector" onClick={() => {
                if (layers.current) layers.current.open = false;
                setInspectorOpen((open) => !open);
              }}>Inspect</button>
          </>}
          <button type="button" className="icon-btn help-btn" aria-label="How to use" title="How to use"
            onClick={(event) => {
              event.currentTarget.focus();
              setHowToOpen(true);
            }}><Icon name="help" /></button>
        </div>
      </header>

      <main className="app__body" id="main" tabIndex={-1} data-ready={Boolean(data)}>
        <div className="app__map">
          {data && loaded ? (
            <MapViewer canvasRef={mapCanvas} meta={data.meta} image={loaded.image} markers={markers} paths={paths}
              activeMarker={activeMarker} onCancelPlacement={() => {
                setActiveMarker(null);
                setPlacementError(null);
              }}
              onMapClick={handleMapClick} onHover={onHover}
              onInspect={(point) => inspect(point, false)}
              onSelectRoute={setMode}
              slopeOverlay={slopeOverlay} elevationOverlay={elevationOverlay}
              showSlopeClasses={showSlopeClasses} showElevation={showElevation} />
          ) : (
            <div className="map-state">
              {error ? (
                <div>
                  <h2 role="alert">Terrain files unavailable</h2>
                  <p>{error}</p>
                  <button type="button" className="btn" onClick={() => {
                    setError(null);
                    setLoadStatus('Loading navigation grid and terrain rasters…');
                    setLoadAttempt((value) => value + 1);
                    document.getElementById('main')?.focus();
                  }}>Retry terrain load</button>
                </div>
              ) : (
                <div>
                  <div className="map-state__skeleton" aria-hidden="true"><i /><i /><i /></div>
                  <p role="status">{loadStatus}</p>
                </div>
              )}
            </div>
          )}
          {data && <aside className="inspect-panel" id="cell-inspector" aria-labelledby="inspect-title"
            hidden={!inspectorOpen} onKeyDown={(event) => {
              if (event.key === 'Escape') closeInspector();
            }}>
            <header>
              <h2 id="inspect-title">Cell inspector</h2>
              <button type="button" className="icon-btn" aria-label="Close inspector" ref={inspectorClose}
                onClick={closeInspector}><Icon name="close" /></button>
            </header>
            <TerrainInfoPanel cell={cell} projected={cellInfo?.projected ?? null}
              elevation={cellInfo?.elevation ?? null} slope={cellInfo?.slope ?? null} cost={cellInfo?.cost ?? null}
              slopeClass={cellInfo?.slopeClass ?? null} excluded={cellInfo?.excluded ?? null}
              endpoint={endpoint || null} size={data.metadata} activeMarker={activeMarker}
              onInspect={inspect} />
          </aside>}
          <span className="sr-only" role="status">{inspectionStatus}</span>
        </div>

        {data && <div className="route-dock">
          <ControlPanel start={start} end={end} activeMarker={activeMarker}
            onActiveMarkerChange={(slot) => {
              setPlacementError(null);
              setActiveMarker((current) => current === slot && start && end ? null : slot);
              mapCanvas.current?.focus({ preventScroll: true });
            }}
            onClear={clear} status={controlStatus} error={placementError} />
          <RouteComparison results={results} activeMode={mode} onSelectMode={setMode}
            status={comparisonStatus} calculating={calculating} />
        </div>}
      </main>
      {howToOpen && <HowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />}
    </div>
  );
}

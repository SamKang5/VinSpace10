import { useCallback, useEffect, useMemo, useState } from 'react';
import { Block } from './components/Block';
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
  const [resultRevision, setResultRevision] = useState(0);
  const [example, setExample] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [showSlopeClasses, setShowSlopeClasses] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [hovered, setHovered] = useState<GridPoint | null>(null);
  const [inspected, setInspected] = useState<GridPoint | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  const data = loaded?.data ?? null;

  const useExample = useCallback((exampleData: AppData) => {
    setStart(EXAMPLE_START);
    setEnd(EXAMPLE_END);
    setActiveMarker(null);
    setMode('shortest');
    setCalculating(false);
    setResults(compareRoutes(exampleData, EXAMPLE_START, EXAMPLE_END));
    setExample(true);
    setResultRevision((value) => value + 1);
    setViewRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const nextData = await loadAppData(controller.signal);
      if (controller.signal.aborted) return;
      setLoadStatus('Decoding CTX orthomosaic…');

      const image = new Image();
      image.src = import.meta.env.BASE_URL + 'terrain/' + nextData.meta.image;
      try {
        await image.decode();
      } catch {
        throw new Error('The CTX orthomosaic could not be loaded or decoded.');
      }
      if (controller.signal.aborted) return;
      useExample(nextData);
      setLoaded({ data: nextData, image });
    };
    load().catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [loadAttempt, useExample]);

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

  const excluded = useMemo(() => ({
    A: data && start ? readCell(data, start).excluded : null,
    B: data && end ? readCell(data, end).excluded : null,
  }), [data, start, end]);
  const affectedSlots = (['A', 'B'] as const).filter((slot) => excluded[slot]);
  const canCalculate = Boolean(start && end && !affectedSlots.length);
  const cell = hovered ?? inspected;
  const cellInfo = data && cell ? readCell(data, cell) : null;
  const endpoint = cell && [matches(cell, start) && 'A', matches(cell, end) && 'B'].filter(Boolean).join(' + ');
  const onHover = useCallback((point: GridPoint | null) => {
    setHovered((previous) => matches(previous, point) ? previous : point);
  }, []);

  const calculate = useCallback(() => {
    if (!data || !canCalculate || calculating) return;
    setCalculating(true);
  }, [data, canCalculate, calculating]);

  useEffect(() => {
    if (!calculating || !data || !start || !end || !canCalculate) return;
    let timeout = 0;
    const frame = requestAnimationFrame(() => {
      timeout = window.setTimeout(() => {
        const nextResults = compareRoutes(data, start, end);
        if (nextResults[mode]?.status !== 'ok') {
          const firstRoute = MODE_ORDER.find((key) => nextResults[key]?.status === 'ok');
          if (firstRoute) setMode(firstRoute);
        }
        setResults(nextResults);
        setResultRevision((value) => value + 1);
        setCalculating(false);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [calculating, data, start, end, canCalculate, mode]);

  const handleMapClick = useCallback((point: GridPoint) => {
    if (!data) return;
    setInspected(point);
    setHovered(null);
    if (!activeMarker) return;
    const excluded = readCell(data, point).excluded;
    if (activeMarker === 'A') setStart(point);
    else setEnd(point);
    setResults({});
    setExample(false);
    setCalculating(false);
    if (!excluded) {
      setActiveMarker(activeMarker === 'A' && !end ? 'B' : activeMarker === 'B' && !start ? 'A' : null);
    }
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
    setExample(false);
    setCalculating(false);
  };

  const paths = useMemo(() => MODE_ORDER.flatMap((key) => {
    const result = results[key];
    return result?.status === 'ok' ? [{
      id: key, points: result.path, color: MODE_COLOR[key], active: key === mode, dashed: MODE_DASHED[key],
    }] : [];
  }), [results, mode]);
  const markers = useMemo(() => ({ A: start ?? undefined, B: end ?? undefined }), [start, end]);

  const resultCount = paths.length;
  const routeFailure = MODE_ORDER.map((key) => results[key]?.status).find((status) => status && status !== 'ok');
  const controlStatus = affectedSlots.length
    ? 'Choose another cell for ' + affectedSlots.join(' and ') + '.'
    : activeMarker
      ? 'Select a map cell for ' + (activeMarker === 'A' ? 'Start A.' : 'End B.')
      : 'Select Start or End to move an endpoint.';
  const comparisonStatus = calculating ? 'Calculating both routes…'
    : resultCount === 2 ? (example ? 'D08 reference traverse · Two routes found' : 'Two routes found')
    : resultCount === 1 ? 'One route found'
    : routeFailure === 'out_of_bounds' ? 'An endpoint is outside the grid.'
    : affectedSlots.length || routeFailure === 'blocked_endpoint' ? 'An endpoint is excluded from routing.'
    : routeFailure === 'no_path' ? 'No route connects these endpoints.'
    : start && end ? 'Calculate routes to compare this pair.'
    : 'Place Start A and End B to compare routes.';

  const selectedInfo = data && inspected ? readCell(data, inspected) : null;
  const inspectionStatus = selectedInfo && inspected
    ? 'Cell ' + inspected[0] + ', ' + inspected[1] + '. ' + (selectedInfo.excluded ?? 'Included in model') +
      '. Elevation ' + (selectedInfo.elevation === null ? 'unavailable' : selectedInfo.elevation.toFixed(1) + ' metres') +
      '. Slope ' + (selectedInfo.slope === null ? 'unavailable' : selectedInfo.slope.toFixed(1) + ' degrees') +
      '. Friction index ' + (selectedInfo.cost?.toFixed(2) ?? 'unavailable') + '.'
    : '';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app__head">
        <div className="app__brand">
          <h1>Mars Navigator</h1>
          <p>Jezero Crater · Western fan</p>
        </div>
        <dl className="app__stats" aria-label="Terrain grid">
          {data && <>
            <div><dt>Grid</dt><dd>{data.metadata.width} × {data.metadata.height}</dd></div>
            <div><dt>Cell</dt><dd>{data.metadata.resolutionProjectedMeters[0]} <span className="unit">m projected</span></dd></div>
            <div><dt>CRS</dt><dd>Mars 2000</dd></div>
          </>}
        </dl>
        <button type="button" className="btn help-btn" onClick={(event) => {
          event.currentTarget.focus();
          setHowToOpen(true);
        }}>
          <Icon name="help" />How to use
        </button>
      </header>

      <main className="app__body" id="main" tabIndex={-1}>
        <div className="app__map">
          {data && loaded ? (
            <MapViewer meta={data.meta} image={loaded.image} markers={markers} paths={paths}
              activeMarker={activeMarker} onCancelPlacement={() => setActiveMarker(null)}
              onMapClick={handleMapClick} onHover={onHover}
              onInspect={(point) => inspect(point, false)}
              slopeOverlay={slopeOverlay} elevationOverlay={elevationOverlay}
              showSlopeClasses={showSlopeClasses} showElevation={showElevation}
              viewRevision={viewRevision} />
          ) : (
            <div className="map-state">
              <div className="map-state__head">CTX orthomosaic</div>
              <div className="map-state__body">
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
                  <div className="map-state__loading">
                    <div className="map-state__skeleton" aria-hidden="true"><i /><i /><i /><i /></div>
                    <p role="status">{loadStatus}</p>
                  </div>
                )}
              </div>
              <div className="map-state__foot">Jezero Crater · Western fan</div>
            </div>
          )}
        </div>

        <aside className="app__rail" aria-label="Route tools">
          <Block title="Route comparison" defaultOpen>
            {data ? <RouteComparison results={results} activeMode={mode} onSelectMode={setMode}
              status={comparisonStatus} resultRevision={resultRevision} calculating={calculating} />
              : <p className="comparison__status">{error ? 'Comparison unavailable.' : 'Waiting for terrain files.'}</p>}
          </Block>
          {data && <>
            <Block title="Endpoints" defaultOpen>
              <ControlPanel start={start} end={end} activeMarker={activeMarker}
                onActiveMarkerChange={(slot) => setActiveMarker((current) => current === slot ? null : slot)}
                onCalculate={calculate} onClear={clear} onUseExample={() => useExample(data)}
                showSlopeClasses={showSlopeClasses} onShowSlopeClassesChange={setShowSlopeClasses}
                showElevation={showElevation} onShowElevationChange={setShowElevation}
                canCalculate={canCalculate} calculating={calculating} excluded={excluded} status={controlStatus} />
            </Block>
            <Block title="Cell inspector" defaultOpen>
              <TerrainInfoPanel cell={cell} projected={cellInfo?.projected ?? null}
                elevation={cellInfo?.elevation ?? null} slope={cellInfo?.slope ?? null} cost={cellInfo?.cost ?? null}
                slopeClass={cellInfo?.slopeClass ?? null} excluded={cellInfo?.excluded ?? null}
                endpoint={endpoint || null} size={data.metadata} activeMarker={activeMarker}
                onInspect={inspect} inspectionStatus={inspectionStatus} />
            </Block>
            <Block title="Terrain key">
              <MapLegend elevation={data.overlay.elevation} counts={data.overlay.hazard.counts}
                statistics={data.metadata.statistics} metresPerPixel={data.meta.metersPerPx}
                areaKm={data.metadata.width * data.metadata.resolutionProjectedMeters[0] / 1000} />
            </Block>
          </>}
          <footer className="provenance">
            <h2>Model and source</h2>
            <p>Research prototype. Friction is an uncalibrated, dimensionless slope index
              <span className="number"> 1 + (slope in degrees ÷ 10)²</span>. It does not measure energy, speed or safety.
              Both modes exclude cells at <span className="number">15</span>° or steeper. Physical image-to-DEM
              registration and the DEM vertical datum remain unresolved.</p>
            <a href="https://doi.org/10.5066/P9GV1ND3">CTX orthomosaic · Fergason et al. 2020 · USGS Astrogeology / NASA MRO</a>
          </footer>
        </aside>
      </main>
      {howToOpen && <HowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { MapViewer, type MarkerSlot } from './components/MapViewer';
import { loadAppData, type AppData } from './lib/data';
import { findPath, type GridPoint, type RouteMode, type RouteResponse } from './lib/router';

const MODE_COLOR: Record<RouteMode, string> = {
  shortest: '#38bdf8',
  'terrain-aware': '#fbbf24',
};

const MODE_LABEL: Record<RouteMode, string> = {
  shortest: 'Shortest path',
  'terrain-aware': 'Terrain-aware path',
};

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<Partial<Record<MarkerSlot, GridPoint>>>({});
  const [activeMarker, setActiveMarker] = useState<MarkerSlot>('A');
  const [mode, setMode] = useState<RouteMode>('terrain-aware');
  const [routes, setRoutes] = useState<Record<RouteMode, RouteResponse> | null>(null);
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadAppData(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => controller.abort();
  }, []);

  const start = markers.A ?? null;
  const end = markers.B ?? null;

  // ---- routing (M1-05) ------------------------------------------------------
  // Both modes are computed together so the comparison cards always show a
  // like-for-like pair, which is what M1-06 needs to draw.
  const computeRoutes = () => {
    if (!data || !start || !end) return;
    setRouting(true);
    const next: Record<RouteMode, RouteResponse> = {
      shortest: findPath(data.grid, start, end, 'shortest'),
      'terrain-aware': findPath(data.grid, start, end, 'terrain-aware'),
    };
    setRoutes(next);
    setRouting(false);
  };

  const paths = useMemo(() => {
    if (!routes) return [];
    return (['shortest', 'terrain-aware'] as RouteMode[])
      .filter((m) => routes[m].path.length > 0)
      .map((m) => ({
        id: m,
        label: MODE_LABEL[m],
        points: routes[m].path,
        color: MODE_COLOR[m],
        // The selected mode is drawn on top; the other stays visible for
        // comparison but recedes.
        active: m === mode,
      }));
  }, [routes, mode]);

  if (loadError) {
    return (
      <main className="app app--error">
        <h1>MARS NAVIGATOR</h1>
        <p className="app__error">Terrain data could not be loaded: {loadError}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app app--loading">
        <h1>MARS NAVIGATOR</h1>
        <p>Loading Jezero Crater terrain and navigation grid…</p>
      </main>
    );
  }

  const stats = data.grid.cost.reduce(
    (acc, c) => {
      if (c === null) acc.blocked += 1;
      else acc.open += 1;
      return acc;
    },
    { open: 0, blocked: 0 },
  );

  return (
    <main className="app">
      <header className="app__head">
        <div>
          <h1 className="app__title">MARS NAVIGATOR</h1>
          <p className="app__sub">Jezero Crater western fan · Jezero Crater, Mars · 267 × 267 cells at 20 m</p>
        </div>
        <dl className="app__stats">
          <div>
            <dt>Traversable cells</dt>
            <dd>{stats.open.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Blocked / unknown</dt>
            <dd>{stats.blocked.toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      <div className="app__body">
        <section className="app__map" aria-label="Terrain map">
          <MapViewer
            meta={data.meta}
            imageUrl={`${import.meta.env.BASE_URL}terrain/ctx-jezero-aoi.png`}
            markers={markers}
            paths={paths}
            activeMarker={activeMarker}
            onMapClick={(point) => setMarkers((m) => ({ ...m, [activeMarker]: point }))}
          />
        </section>

        <aside className="app__panel" aria-label="Route controls">
          <div className="panel__block">
            <h2 className="panel__heading">Waypoints</h2>
            <div className="panel__markers" role="radiogroup" aria-label="Marker to place">
              {(['A', 'B'] as MarkerSlot[]).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={activeMarker === slot}
                  className={`chip chip--${slot.toLowerCase()} ${activeMarker === slot ? 'is-active' : ''}`}
                  onClick={() => setActiveMarker(slot)}
                >
                  <span className="chip__dot" aria-hidden="true" />
                  {slot === 'A' ? 'Start' : 'End'}
                  {markers[slot] ? (
                    <code className="chip__coord">
                      [{markers[slot]![0]}, {markers[slot]![1]}]
                    </code>
                  ) : (
                    <span className="chip__coord chip__coord--empty">unset</span>
                  )}
                </button>
              ))}
            </div>
            <p className="panel__note">
              Pick a marker, then click the map to place it. Drag to pan, scroll to zoom.
            </p>
          </div>

          <div className="panel__block">
            <h2 className="panel__heading">Routing mode</h2>
            <div className="panel__modes" role="radiogroup" aria-label="Routing mode">
              {(['shortest', 'terrain-aware'] as RouteMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={`mode ${mode === m ? 'is-active' : ''}`}
                  onClick={() => setMode(m)}
                >
                  <span className="mode__swatch" style={{ background: MODE_COLOR[m] }} aria-hidden="true" />
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={computeRoutes}
              disabled={!start || !end || routing}
            >
              {routing ? 'Routing…' : 'Calculate route'}
            </button>
            {(!start || !end) && <p className="panel__note">Place both A and B to calculate a route.</p>}
          </div>

          {/* M1-07: integration slot for M4's route comparison cards. */}
          <div className="panel__block" data-m4-slot="route-comparison-cards">
            <h2 className="panel__heading">Route comparison</h2>
            {!routes && <p className="panel__note">No route calculated yet.</p>}
            {routes &&
              (['shortest', 'terrain-aware'] as RouteMode[]).map((m) => {
                const r = routes[m];
                return (
                  <article key={m} className={`card card--${m} ${mode === m ? 'is-active' : ''}`} data-route-mode={m}>
                    <h3 className="card__title">
                      <span className="mode__swatch" style={{ background: MODE_COLOR[m] }} aria-hidden="true" />
                      {MODE_LABEL[m]}
                    </h3>
                    {r.status !== 'ok' || !r.metrics ? (
                      <p className="card__error">{r.error ?? 'No route'}</p>
                    ) : (
                      <dl className="card__metrics">
                        <div>
                          <dt>Distance</dt>
                          <dd>{(r.metrics.distanceMeters / 1000).toFixed(2)} km</dd>
                        </div>
                        <div>
                          <dt>Cost</dt>
                          <dd>{r.metrics.cost.toFixed(0)}</dd>
                        </div>
                        <div>
                          <dt>Cells</dt>
                          <dd>{r.metrics.cells}</dd>
                        </div>
                        <div>
                          <dt>Mean friction</dt>
                          <dd>{r.metrics.meanFriction.toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt>Detour</dt>
                          <dd>{r.metrics.detourRatio.toFixed(2)}×</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{r.status}</dd>
                        </div>
                      </dl>
                    )}
                  </article>
                );
              })}
          </div>
        </aside>
      </div>

      <footer className="app__foot">
        <p>
          Terrain image: USGS Astrogeology CTX orthomosaic for Mars 2020 Terrain Relative Navigation
          (doi:10.5066/P9GV1ND3). Navigation grid: M2-02 export from the D07 pipeline. Costs are
          dimensionless friction derived from slope and are a research demo, not a Mars safety
          assessment.
        </p>
      </footer>
    </main>
  );
}

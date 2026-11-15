import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../lib/data';
import { route, type GridPoint, type RouteMode, type RouteResult } from '../lib/router';
import { MODE_COLOR, MODE_LABEL } from '../lib/theme';
import { Icon } from '../components/Icon';
import MissionScene from './MissionScene';
import { CELL_X, CELL_Z, cellPosition, createMission, createSurveys, distance, missionBudget, missionScore,
  positionCell, SCAN_RADIUS, SCAN_SECONDS, SCIENCE_POINTS_PER_SURVEY, type MissionState, type Survey } from './missionModel';
import './mission.css';

type Props = { data: AppData; image: HTMLImageElement; start: GridPoint; end: GridPoint;
  routes: RouteResult[]; selected: RouteMode; onExit: () => void };
type Phase = 'briefing' | 'playing' | 'paused' | 'results';
const TRAVEL_PACES = [
  { scale: 1, label: 'Real time' },
  { scale: 12, label: 'Expedition' },
  { scale: 30, label: 'Fast travel' },
];

function clock(seconds: number) {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
function meters(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`; }
function signedPoints(value: number) { return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0'; }

class SceneBoundary extends Component<{ children: ReactNode; onExit: () => void; onError: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    if (this.state.error) return <div className="mission-unavailable" role="alert"><h2>3D graphics unavailable</h2>
      <p>Enable hardware acceleration in your browser and try again. Your planned route is still available.</p>
      <button className="btn" onClick={this.props.onExit}>Back to planner</button></div>;
    return this.props.children;
  }
}

function MissionMap({ data, image, hud, routes, selected, surveys, start, end, showRoutes, debrief = false }: {
  data: AppData; image: HTMLImageElement; hud: MissionState; routes: RouteResult[];
  selected: RouteMode; surveys: Survey[]; start: GridPoint; end: GridPoint; showRoutes: boolean; debrief?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 534; canvas.height = 534;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(image, 0, 0, 534, 534);
      const { width, height } = data.routing;
      ctx.fillStyle = 'rgba(209,76,36,.65)';
      for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
        if (data.hazard[r * width + c] >= 3 || data.routing.mask[r * width + c] !== 1)
          ctx.fillRect(c / width * 534, r / height * 534, 534 / width + 0.3, 534 / height + 0.3);
      }
    }
    return canvas;
  }, [data, image]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = data.routing;
    const xy = ([r, c]: GridPoint) => [(c + 0.5) / width * 534, (r + 0.5) / height * 534];
    const [px, py] = xy([hud.position.z / CELL_Z, hud.position.x / CELL_X]);
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = 'rgba(20,17,15,.18)'; ctx.fillRect(0, 0, 534, 534);
    if (showRoutes) routes.forEach(result => {
      ctx.beginPath(); ctx.strokeStyle = debrief ? '#fff4d8' : MODE_COLOR[result.mode];
      ctx.lineWidth = debrief ? 6 : result.mode === selected ? 4 : 2;
      ctx.globalAlpha = result.mode === selected ? 1 : 0.55;
      ctx.setLineDash(debrief || result.mode === 'terrain-aware' ? [9, 6] : []);
      result.path.forEach((cell, i) => { const [x, y] = xy(cell); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = debrief ? '#61dff5' : '#fff4d8'; ctx.lineWidth = debrief ? 3.5 : 2;
    ctx.lineJoin = 'round'; ctx.beginPath();
    hud.trail.forEach((p, i) => {
      const [x, y] = xy([p.z / CELL_Z, p.x / CELL_X]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (debrief) ctx.lineTo(px, py);
    ctx.stroke();
    surveys.forEach(s => {
      const [x, y] = xy(s.cell);
      const completed = hud.scans.includes(s.id);
      if (!debrief) {
        ctx.fillStyle = completed ? '#7e9e7e' : '#e6ebcf';
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      } else if (completed) {
        ctx.fillStyle = '#b8ca9c'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#253323'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 1, y + 3); ctx.lineTo(x + 5, y - 3); ctx.stroke();
      }
    });
    [start, end].forEach((cell, i) => {
      const [x, y] = xy(cell); ctx.fillStyle = i ? '#f5b777' : '#b4d4df';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#201b16'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i ? 'B' : 'A', x, y + 0.5);
    });
    if (!debrief || hud.status === 'failed') {
      ctx.beginPath(); ctx.arc(px, py, debrief ? 12 : 6, 0, Math.PI * 2); ctx.lineWidth = 3;
      ctx.strokeStyle = debrief ? '#ffae94' : '#271d18';
      if (!debrief) { ctx.fillStyle = '#ffffff'; ctx.fill(); }
      ctx.stroke();
    }
  }, [base, data, hud, routes, selected, surveys, start, end, showRoutes, debrief]);
  return <canvas className="mission-map__canvas" width={534} height={534}
    ref={canvasRef} role="img" aria-label={debrief
      ? `North-up debrief map. Dashed ivory: planned route. Solid cyan: actual trail. Green checks: completed surveys.${hud.status === 'failed' ? ' Coral ring: where you stopped.' : ''} A: start, B: destination.`
      : 'North-up mission map. White dot: your position. White trail: your journey. Red terrain: excluded. A: start, B: destination.'} />;
}

function SuitMeter({ resource, value }: { resource: 'oxygen' | 'energy'; value: number }) {
  return <div className={`suit-meter suit-meter--${resource}`} data-low={value < 25}>
    <Icon name={resource} />
    <meter min={0} max={100} value={value} aria-label={`${resource === 'oxygen' ? 'Oxygen' : 'Energy'} remaining`} />
    <span aria-hidden="true">{Math.ceil(value)}%</span>
  </div>;
}

export default function MissionGame({ data, image, start, end, routes, selected, onExit }: Props) {
  const [run, setRun] = useState(0);
  const mission = useMemo(() => createMission(start), [start, run]);
  const [hud, setHud] = useState<MissionState>(() => ({ ...mission }));
  const [phase, setPhase] = useState<Phase>('briefing');
  const [guide, setGuide] = useState(selected);
  const [guidance, setGuidance] = useState(routes);
  const [departureRoute, setDepartureRoute] = useState(() => routes.find(route => route.mode === selected) ?? routes[0]);
  const [paceStep, setPaceStep] = useState(1);
  const paceIndex = paceStep % TRAVEL_PACES.length;
  const pace = TRAVEL_PACES[paceIndex];
  const cyclePace = useCallback(() => setPaceStep(step => step + 1), []);
  const [showRoutes, setShowRoutes] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState<Survey>();
  const [pointGain, setPointGain] = useState<number>();
  const [hudAnimations, setHudAnimations] = useState(true);
  const [notice, setNotice] = useState('Routes are suggestions. Explore freely and reach destination B.');
  const [recalculating, setRecalculating] = useState(false);
  const [graphicsError, setGraphicsError] = useState(false);
  const [history, setHistory] = useState<{ distance: number; elapsed: number; score: number; success: boolean }[]>([]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dialog = useRef<HTMLDialogElement>(null);
  const record = useRef<MissionState | null>(null);
  const reportedScans = useRef(0);
  const rerouteTimer = useRef<number>();
  const originalShortest = routes.find(r => r.mode === 'shortest') ?? routes[0];
  const budget = missionBudget(originalShortest);
  const surveys = useMemo(() => createSurveys(data.routing, routes), [data, routes]);
  const nearest = surveys.filter(s => !hud.scans.includes(s.id)).sort((a, b) => distance(hud.position, a.position) - distance(hud.position, b.position))[0];
  const inRange = nearest && distance(hud.position, nearest.position) <= SCAN_RADIUS ? nearest : undefined;
  const remaining = distance(hud.position, cellPosition(end));
  const cell = positionCell(hud.position);
  const slope = data.routing.slope[cell[0] * data.routing.width + cell[1]] ?? 0;
  const score = missionScore(hud);

  const releasePointer = useCallback(() => { if (document.pointerLockElement) document.exitPointerLock(); }, []);
  const pause = useCallback(() => {
    setHud({ ...mission, scans: [...mission.scans] });
    setPhase(p => p === 'playing' ? 'paused' : p); releasePointer();
  }, [releasePointer, mission]);
  const blocked = useCallback(() => setNotice('This terrain is excluded or outside the mapped area. Choose another direction; the minimap marks excluded cells in red.'), []);
  const update = useCallback(() => {
    setHud({ ...mission, scans: [...mission.scans] });
    if (scanning && mission.scans.includes(scanning.id)) setScanning(undefined);
    if (mission.scans.length > reportedScans.current) {
      reportedScans.current = mission.scans.length;
      setPointGain(mission.scans.length);
      setNotice('Survey recorded. Continue toward extraction beacon B.');
    }
    if (mission.status !== 'active') {
      setPhase('results');
      releasePointer();
      if (record.current !== mission) {
        record.current = mission;
        setHistory(previous => [...previous.slice(-4), { distance: mission.distance, elapsed: mission.elapsed,
          score: missionScore(mission).total, success: mission.status === 'success' }]);
      }
    }
  }, [mission, releasePointer, scanning]);

  useEffect(() => {
    if (pointGain === undefined) return;
    const timeout = window.setTimeout(() => setPointGain(undefined), 1000);
    return () => window.clearTimeout(timeout);
  }, [pointGain]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (phase !== 'playing' && element && !element.open) {
      element.showModal();
      if (phase === 'results') {
        element.querySelector<HTMLElement>('#mission-dialog-title')?.focus({ preventScroll: true });
        element.scrollTop = 0;
      }
    }
    else if (phase === 'playing' && element?.open) {
      element.close();
      document.querySelector<HTMLCanvasElement>('.mission__world canvas')?.focus();
    }
  }, [phase]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) pause(); };
    let locked = false;
    const lockChange = () => {
      if (locked && !document.pointerLockElement) pause();
      locked = Boolean(document.pointerLockElement);
    };
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('pointerlockchange', lockChange);
    return () => { document.removeEventListener('visibilitychange', hidden); document.removeEventListener('pointerlockchange', lockChange); };
  }, [pause]);
  useEffect(() => () => { releasePointer(); window.clearTimeout(rerouteTimer.current); }, [releasePointer]);
  const scan = useCallback(() => {
    if (phase !== 'playing') return;
    if (scanning) { setScanning(undefined); mission.scanProgress = 0; return; }
    if (inRange) { setScanning(inRange); setNotice('Survey running. Your astronaut stops while the instruments collect data.'); }
    else setNotice('Move within 28 m of a survey flag to scan.');
  }, [phase, scanning, inRange, mission]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (phase === 'playing' && event.code === 'Escape') { event.preventDefault(); pause(); return; }
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (phase === 'playing' && event.code === 'KeyE') { event.preventDefault(); scan(); }
      if (phase === 'playing' && event.code === 'KeyM') { event.preventDefault(); setExpanded(v => !v); }
      if (phase === 'playing' && event.code === 'KeyP' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); cyclePace();
      }
      if (phase === 'playing' && event.code === 'KeyR' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setGuide(mode => mode === 'shortest' ? 'terrain-aware' : 'shortest');
        setShowRoutes(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase, pause, scan, cyclePace]);

  const restart = () => {
    releasePointer();
    const fresh = createMission(start);
    setHud(fresh); setRun(v => v + 1); setGuidance(routes); setScanning(undefined);
    reportedScans.current = 0;
    setPointGain(undefined);
    setNotice('New expedition. Your previous result is saved for comparison.'); setPhase('briefing');
  };
  const recalculate = () => {
    if (recalculating) return;
    setRecalculating(true);
    rerouteTimer.current = window.setTimeout(() => {
      const from = positionCell(mission.position);
      const next = (['shortest', 'terrain-aware'] as RouteMode[]).map(mode => route(data.routing, from, end, mode));
      const valid = next.filter(r => r.status === 'ok');
      setGuidance(valid); setRecalculating(false);
      setNotice(valid.length ? 'Guidance updated from your current position. Mission reserves are unchanged.' : 'No route found here. Retrace your steps toward the last valid route.');
    }, 40);
  };
  const exit = () => { releasePointer(); onExit(); };
  const briefingRoute = routes.find(route => route.mode === guide) ?? originalShortest;
  const plannedDistance = departureRoute.distanceMeters ?? 0;
  const distanceDifference = hud.distance - plannedDistance;
  const completed = hud.status === 'success';

  if (graphicsError) return <section className="mission"><div className="mission-unavailable" role="alert">
    <h2>3D graphics unavailable</h2><p>Enable hardware acceleration in your browser and try again. Your planned route is still available.</p>
    <button className="mission-button" onClick={exit}>Back to planner</button>
  </div></section>;

  return <section className="mission" data-hud-animations={hudAnimations ? 'on' : 'off'} aria-label="Mars surface expedition">
    <div className="mission__world"><SceneBoundary onExit={exit} onError={() => setGraphicsError(true)}>
      <MissionScene key={run} data={data} image={image} start={start} end={end} routes={guidance}
        selected={guide} surveys={surveys} mission={mission} budget={budget} active={phase === 'playing'}
        timeScale={pace.scale} scanning={scanning} showRoutes={showRoutes} reducedMotion={reducedMotion}
        onUpdate={update} onPause={pause} onBlocked={blocked} />
    </SceneBoundary></div>

    <header className="mission__header">
      <div className="mission__brand">
        <span>Mars Navigator</span><small>Jezero Crater</small>
        <div className="mission__comms"><span>MISSION CONTROL</span><p role="status">{notice}</p></div>
      </div>
      <div className="mission__destination">
        <span>DESTINATION B</span><strong>{meters(remaining)}</strong>
        <div className="mission__telemetry">
          <span>Mission time <b>{clock(hud.elapsed)}</b></span><span aria-hidden="true">·</span>
          <span><b>{meters(hud.distance)}</b> walked</span>
        </div>
        <div className="mission__science" role="status">Science score <b>{score.science}</b></div>
      </div>
      <button type="button" className="mission__pause" onClick={pause} aria-keyshortcuts="Escape">Pause <kbd>Esc</kbd></button>
    </header>

    <aside className="mission__context">
      <div className="mission__terrain"><span>Cell {cell[0]}, {cell[1]}</span><span>Slope {Math.max(0, slope).toFixed(1)}°</span>
        <span>{hud.scans.length} / {surveys.length} surveys</span></div>
      <div className="mission__keys"><span><kbd>W A S D</kbd> Move</span>
        <span>Click / drag to look</span><span>Scroll to zoom</span><span><kbd>R</kbd> Switch route</span></div>
    </aside>

    <aside className={`mission-map${expanded ? ' mission-map--expanded' : ''}`} aria-label="Navigation assistant">
      <header><button className="mission-text-button mission-map__toggle" onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? 'Minimize map' : 'Expand map'} aria-expanded={expanded} aria-keyshortcuts="M"><kbd>M</kbd></button>
        <div className="mission-map__routes" role="group" aria-label="Highlighted route" aria-keyshortcuts="R" title="Press R to switch the highlighted route">{(['shortest', 'terrain-aware'] as RouteMode[]).map(mode => <button key={mode}
          aria-pressed={showRoutes && guide === mode}
          onClick={() => { setGuide(mode); setShowRoutes(true); }}>{mode === 'shortest' ? 'Shortest' : 'Terrain-aware'}</button>)}</div>
      </header>
      <MissionMap data={data} image={image} hud={hud} routes={guidance} selected={guide} surveys={surveys} start={start} end={end} showRoutes={showRoutes} />
      <div className="suit-meters" role="group" aria-label="Suit resources">
        <SuitMeter resource="oxygen" value={hud.oxygen} />
        <SuitMeter resource="energy" value={hud.energy} />
      </div>
    </aside>

    {phase === 'playing' && pointGain !== undefined && <div key={pointGain} className="mission__point-gain" aria-hidden="true">
      +{SCIENCE_POINTS_PER_SURVEY} <span>points</span>
    </div>}

    <div className="mission__action">
      {(inRange || scanning) && <button type="button" className="scan-prompt" data-scanning={Boolean(scanning)}
        disabled={phase !== 'playing'} onClick={scan} aria-keyshortcuts="E" aria-label={scanning ? 'Cancel scan' : undefined}>
        {scanning ? <progress value={hud.scanProgress} max={SCAN_SECONDS} aria-label="Survey scan progress" />
          : <><kbd>E</kbd><span>Scan <span className="scan-prompt__points">(+{SCIENCE_POINTS_PER_SURVEY} points)</span></span></>}
      </button>}
      <button type="button" className="mission__pace" onClick={cyclePace} aria-keyshortcuts="P"
        aria-label={`Cycle travel pace. Current pace: ${pace.scale}× ${pace.label}`}>
        <span className="mission__pace-caption" aria-hidden="true">Travel pace <kbd>P</kbd></span>
        <span className="mission__pace-window" aria-hidden="true">
          <span key={paceStep} className="mission__pace-track" data-rolling={paceStep > 1}>
            {[-2, -1, 0, 1].map(offset => {
              const option = TRAVEL_PACES[(paceIndex + TRAVEL_PACES.length + offset) % TRAVEL_PACES.length];
              return <span key={offset}>{option.scale}×</span>;
            })}
          </span>
        </span>
      </button>
    </div>

    <footer className="mission__credit">NASA / USGS terrain. Artistic color. Simulated resources and survey sites. Research prototype.</footer>

    <dialog className={`mission-dialog mission-dialog--${phase}`} ref={dialog} aria-labelledby="mission-dialog-title" onCancel={event => {
      event.preventDefault(); if (phase === 'paused') setPhase('playing');
    }}>
      {phase === 'briefing' && <>
        <span className="mission-dialog__label">Mission briefing</span>
        <h1 id="mission-dialog-title">Reach extraction beacon B.</h1>
        <p>Scan survey flags along the route for {SCIENCE_POINTS_PER_SURVEY} points each.</p>
        <dl className="mission-dialog__facts">
          <div><dt>Planned distance</dt><dd>{meters(briefingRoute.distanceMeters ?? 0)}</dd></div>
          <div><dt>Navigation guide</dt><dd>{MODE_LABEL[guide]}</dd></div>
        </dl>
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" autoFocus onClick={() => { setDepartureRoute(briefingRoute); setPhase('playing'); }}>Begin expedition</button>
          <button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
      {phase === 'paused' && <>
        <span className="mission-dialog__label">EXPEDITION PAUSED</span><h1 id="mission-dialog-title">Take your bearings.</h1>
        <p>Your oxygen, energy, and mission clock are paused. Resume when you are ready.</p>
        <div className="mission-dialog__navigation"><label><input type="checkbox" checked={showRoutes} onChange={e => setShowRoutes(e.target.checked)} /> Show guidance</label>
          <label><input type="checkbox" checked={hudAnimations} onChange={e => setHudAnimations(e.target.checked)} /> HUD animations</label>
          <button className="mission-text-button" disabled={recalculating} onClick={recalculate}>{recalculating ? 'Calculating…' : 'Recalculate route'}</button></div>
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" autoFocus onClick={() => setPhase('playing')}>Resume expedition</button>
          <button className="mission-button" onClick={restart}>Restart mission</button><button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
      {phase === 'results' && <>
        <span className="mission-dialog__label">MISSION DEBRIEF</span>
        <h1 id="mission-dialog-title" tabIndex={-1}>{completed ? 'Destination reached.' : 'Expedition ended.'}</h1>
        {!completed && <p className="mission-debrief__failure">{hud.failure}.</p>}
        <div className="mission-debrief">
          <figure className="mission-debrief__map">
            <MissionMap data={data} image={image} hud={hud} routes={[departureRoute]} selected={departureRoute.mode}
              surveys={surveys} start={start} end={end} showRoutes debrief />
            <ul className="mission-debrief__legend" aria-label="Map legend">
              <li className="mission-debrief__planned">Planned route</li>
              <li className="mission-debrief__actual">Actual trail</li>
              <li className="mission-debrief__survey">Survey completed</li>
              {!completed && <li className="mission-debrief__stop">Stopped here</li>}
            </ul>
          </figure>
          <div className="mission-debrief__summary">
            <section aria-labelledby="mission-points-label">
              <h2 id="mission-points-label" className="mission-debrief__score-label">Mission points</h2>
              <strong className="mission-debrief__total">{score.total}</strong>
              <dl className="mission-debrief__breakdown">
                <div><dt>Arrival bonus</dt><dd>{signedPoints(score.arrival)}</dd></div>
                <div><dt>Science points</dt><dd>{signedPoints(score.science)}</dd></div>
                <div><dt>Reserve bonus</dt><dd>{signedPoints(score.efficiency)}</dd></div>
                <div><dt>Terrain risk penalty</dt><dd>{signedPoints(-score.riskPenalty)}</dd></div>
                {score.floorAdjustment > 0 && <div><dt>Minimum score adjustment</dt><dd>{signedPoints(score.floorAdjustment)}</dd></div>}
              </dl>
            </section>
            <dl className="mission-debrief__stats">
              <div><dt>Planned distance</dt><dd>{meters(plannedDistance)}</dd></div>
              <div><dt>Distance walked</dt><dd>{meters(hud.distance)}</dd></div>
            </dl>
            <p className="mission-debrief__comparison">{completed
              ? Math.abs(distanceDifference) < 0.5 ? 'Same distance as planned' : `${meters(Math.abs(distanceDifference))} ${distanceDifference > 0 ? 'farther' : 'shorter'} than planned`
              : `${meters(remaining)} remaining to B`}</p>
          </div>
        </div>
        <dl className="mission-debrief__metrics">
          <div><dt>Mission time</dt><dd>{clock(hud.elapsed)}</dd></div>
          <div><dt>Oxygen left</dt><dd>{Math.ceil(hud.oxygen)}%</dd></div>
          <div><dt>Energy left</dt><dd>{Math.ceil(hud.energy)}%</dd></div>
          <div><dt>Surveys completed</dt><dd>{hud.scans.length} / {surveys.length}</dd></div>
        </dl>
        {history.length > 1 && <div className="mission-history"><h2>Previous run</h2><p>{history[history.length - 2].success ? 'Completed' : 'Incomplete'} · {history[history.length - 2].score} points, {meters(history[history.length - 2].distance)}, {clock(history[history.length - 2].elapsed)}.</p></div>}
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" onClick={restart}>Play again</button>
          <button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
    </dialog>
  </section>;
}

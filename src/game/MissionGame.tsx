import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../lib/data';
import { route, type GridPoint, type RouteMode, type RouteResult } from '../lib/router';
import { MODE_COLOR, MODE_LABEL } from '../lib/theme';
import MissionScene from './MissionScene';
import { cellPosition, createMission, createSurveys, distance, missionBudget, missionScore,
  positionCell, SCAN_RADIUS, SCAN_SECONDS, type MissionState, type Survey } from './missionModel';
import './mission.css';

type Props = { data: AppData; image: HTMLImageElement; start: GridPoint; end: GridPoint;
  routes: RouteResult[]; selected: RouteMode; onExit: () => void };
type Phase = 'briefing' | 'playing' | 'paused' | 'results';

function clock(seconds: number) {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
function meters(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`; }

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

function MissionMap({ data, image, hud, routes, selected, surveys, start, end, expanded, showRoutes }: {
  data: AppData; image: HTMLImageElement; hud: MissionState; routes: RouteResult[];
  selected: RouteMode; surveys: Survey[]; start: GridPoint; end: GridPoint; expanded: boolean; showRoutes: boolean;
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
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = 'rgba(20,17,15,.18)'; ctx.fillRect(0, 0, 534, 534);
    if (showRoutes) routes.forEach(result => {
      ctx.beginPath(); ctx.strokeStyle = MODE_COLOR[result.mode]; ctx.lineWidth = result.mode === selected ? 4 : 2;
      ctx.globalAlpha = result.mode === selected ? 1 : 0.55;
      ctx.setLineDash(result.mode === 'terrain-aware' ? [9, 6] : []);
      result.path.forEach((cell, i) => { const [x, y] = xy(cell); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = '#fff4d8'; ctx.lineWidth = 2; ctx.beginPath();
    hud.trail.forEach((p, i) => {
      const [x, y] = xy([p.z / 20, p.x / (cellPosition([0, 1]).x)]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }); ctx.stroke();
    surveys.forEach(s => {
      const [x, y] = xy(s.cell); ctx.fillStyle = hud.scans.includes(s.id) ? '#7e9e7e' : '#e6ebcf';
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
    });
    [start, end].forEach((cell, i) => {
      const [x, y] = xy(cell); ctx.fillStyle = i ? '#f5b777' : '#b4d4df';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#201b16'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i ? 'B' : 'A', x, y + 0.5);
    });
    const [px, py] = xy([hud.position.z / 20, hud.position.x / cellPosition([0, 1]).x]);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#271d18'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }, [base, data, hud, routes, selected, surveys, start, end, showRoutes]);
  return <canvas className={expanded ? 'mission-map__canvas is-expanded' : 'mission-map__canvas'} width={534} height={534}
    ref={canvasRef} role="img" aria-label="North-up mission map. White dot: your position. White trail: your journey. Red terrain: excluded. A: start, B: destination." />;
}

export default function MissionGame({ data, image, start, end, routes, selected, onExit }: Props) {
  const [run, setRun] = useState(0);
  const mission = useMemo(() => createMission(start), [start, run]);
  const [hud, setHud] = useState<MissionState>(() => ({ ...mission }));
  const [phase, setPhase] = useState<Phase>('briefing');
  const [guide, setGuide] = useState(selected);
  const [guidance, setGuidance] = useState(routes);
  const [timeScale, setTimeScale] = useState(12);
  const [showRoutes, setShowRoutes] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [scanning, setScanning] = useState<Survey>();
  const [notice, setNotice] = useState('Routes are suggestions. Explore freely and reach destination B.');
  const [recalculating, setRecalculating] = useState(false);
  const [graphicsError, setGraphicsError] = useState(false);
  const [history, setHistory] = useState<{ distance: number; elapsed: number; score: number; success: boolean; guide: RouteMode }[]>([]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dialog = useRef<HTMLDialogElement>(null);
  const record = useRef<MissionState | null>(null);
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
    if (scanning && mission.scans.includes(scanning.id)) {
      setScanning(undefined);
      setNotice('Survey recorded. +20 science points. Continue toward extraction beacon B.');
    }
    if (mission.status !== 'active') {
      setPhase('results');
      releasePointer();
      if (record.current !== mission) {
        record.current = mission;
        setHistory(previous => [...previous.slice(-4), { distance: mission.distance, elapsed: mission.elapsed,
          score: missionScore(mission).total, success: mission.status === 'success', guide }]);
      }
    }
  }, [mission, guide, releasePointer, scanning]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (phase !== 'playing' && element && !element.open) element.showModal();
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
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement || event.repeat) return;
      if (phase === 'playing' && event.code === 'Escape') { event.preventDefault(); pause(); }
      if (phase === 'playing' && event.code === 'KeyE') { event.preventDefault(); scan(); }
      if (phase === 'playing' && event.code === 'KeyM') { event.preventDefault(); setExpanded(v => !v); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase, pause, scan]);

  const restart = () => {
    releasePointer();
    const fresh = createMission(start);
    setHud(fresh); setRun(v => v + 1); setGuidance(routes); setScanning(undefined);
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
  const recommended = originalShortest.distanceMeters ?? 0;

  if (graphicsError) return <section className="mission"><div className="mission-unavailable" role="alert">
    <h2>3D graphics unavailable</h2><p>Enable hardware acceleration in your browser and try again. Your planned route is still available.</p>
    <button className="mission-button" onClick={exit}>Back to planner</button>
  </div></section>;

  return <section className="mission" aria-label="Mars surface expedition">
    <div className="mission__world"><SceneBoundary onExit={exit} onError={() => setGraphicsError(true)}>
      <MissionScene key={run} data={data} image={image} start={start} end={end} routes={guidance}
        selected={guide} surveys={surveys} mission={mission} budget={budget} active={phase === 'playing'}
        timeScale={timeScale} scanning={scanning} showRoutes={showRoutes} reducedMotion={reducedMotion}
        onUpdate={update} onPause={pause} onBlocked={blocked} />
    </SceneBoundary></div>

    <header className="mission__header">
      <div className="mission__brand"><span>Mars Navigator</span><small>Surface expedition / Jezero Crater</small></div>
      <div className="mission__destination"><span>DESTINATION B</span><strong>{meters(remaining)}</strong><small>direct distance</small></div>
      <button className="mission-button" onClick={pause}>Pause <kbd>Esc</kbd></button>
    </header>

    <aside className="mission__instruments" aria-label="Suit resources">
      {[['Oxygen', hud.oxygen], ['Energy', hud.energy]].map(([label, value]) => <div className="suit-reading" key={label} data-low={Number(value) < 25}>
        <span>{label}</span><strong>{Math.ceil(Number(value))}<small>%</small></strong>
        <meter min={0} max={100} low={25} value={Number(value)} aria-label={`${label} remaining`} />
      </div>)}
      <div className="suit-reading"><span>Mission time</span><strong>{clock(hud.elapsed)}</strong><small>{meters(hud.distance)} walked</small></div>
    </aside>

    <aside className="mission__context">
      <div className="mission__comms"><span>MISSION CONTROL</span><p role="status">{notice}</p></div>
      <div className="mission__terrain"><span>Cell {cell[0]}, {cell[1]}</span><span>Slope {Math.max(0, slope).toFixed(1)}°</span>
        <span>{hud.scans.length} / {surveys.length} surveys</span></div>
      <div className="mission__keys"><span><kbd>W A S D</kbd> Move</span><span><kbd>Shift</kbd> Sprint</span>
        <span>Click / drag to look</span><span>Scroll to zoom</span></div>
    </aside>

    <aside className={`mission-map${expanded ? ' mission-map--expanded' : ''}`} aria-label="Navigation assistant">
      <header><span>Navigation</span><button className="mission-text-button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Minimize' : 'Expand'} <kbd>M</kbd></button></header>
      <div className="mission-map__north">N ↑ <span>Red: excluded terrain</span></div>
      <MissionMap data={data} image={image} hud={hud} routes={guidance} selected={guide} surveys={surveys} start={start} end={end} expanded={expanded} showRoutes={showRoutes} />
      <div className="mission-map__routes">{(['shortest', 'terrain-aware'] as RouteMode[]).map(mode => <button key={mode}
        style={{ '--guide-color': MODE_COLOR[mode] } as React.CSSProperties} aria-pressed={guide === mode}
        onClick={() => setGuide(mode)}>{mode === 'shortest' ? 'Shortest' : 'Terrain-aware'}</button>)}</div>
      <div className="mission-map__actions"><label><input type="checkbox" checked={showRoutes} onChange={e => setShowRoutes(e.target.checked)} /> Show guidance</label>
        <button className="mission-text-button" disabled={recalculating || phase !== 'playing'} onClick={recalculate}>{recalculating ? 'Calculating…' : 'Recalculate'}</button></div>
      <small>White dot: you. White line: your actual journey.</small>
    </aside>

    <div className="mission__action">
      {(inRange || scanning) && <div className="scan-prompt"><span>SIMULATED SURVEY</span><strong>{(scanning ?? inRange)?.name}</strong>
        <p>{(scanning ?? inRange)?.description}</p>
        <button className="mission-button mission-button--primary" disabled={phase !== 'playing'} onClick={scan}>
          {scanning ? `Cancel scan ${Math.floor(hud.scanProgress / SCAN_SECONDS * 100)}%` : 'Scan +20 points'} <kbd>E</kbd>
        </button>{scanning && <progress value={hud.scanProgress} max={SCAN_SECONDS} aria-label="Survey scan progress" />}</div>}
      <label className="mission__pace">Travel pace <select value={timeScale} onChange={e => setTimeScale(Number(e.target.value))}>
        <option value={1}>1× real time</option><option value={12}>12× expedition</option><option value={30}>30× fast travel</option>
      </select></label>
    </div>

    <footer className="mission__credit">NASA / USGS terrain. Artistic color. Simulated resources and survey sites. Research prototype.</footer>

    <dialog className="mission-dialog" ref={dialog} aria-labelledby="mission-dialog-title" onCancel={event => {
      event.preventDefault(); if (phase === 'paused') setPhase('playing');
    }}>
      {phase === 'briefing' && <>
        <span className="mission-dialog__label">MISSION BRIEFING</span>
        <h1 id="mission-dialog-title">Your route.<br />Your expedition.</h1>
        <p>Leave base A and reach the extraction beacon at B. Follow your navigation guide, or find your own way across Jezero.</p>
        <dl className="mission-dialog__facts"><div><dt>Planned distance</dt><dd>{meters(recommended)}</dd></div>
          <div><dt>Navigation guide</dt><dd>{MODE_LABEL[guide]}</dd></div><div><dt>Survey sites</dt><dd>{surveys.length} simulated</dd></div></dl>
        <ul className="mission-dialog__instructions"><li><kbd>W A S D</kbd> Walk freely. Hold Shift to sprint.</li>
          <li><kbd>Mouse</kbd> Click or drag the scene to look around.</li><li><kbd>E</kbd> Scan near survey flags for science points.</li>
          <li><kbd>M</kbd> Expand your map. Escape pauses the mission.</li></ul>
        <p className="mission-dialog__note">Red-tinted ground is excluded by the terrain model. Oxygen drains with time; walking and scanning use energy. Travel starts at 12× speed, including resource use. Reach B before either reserve runs out.</p>
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" autoFocus onClick={() => setPhase('playing')}>Begin expedition</button>
          <button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
      {phase === 'paused' && <>
        <span className="mission-dialog__label">EXPEDITION PAUSED</span><h1 id="mission-dialog-title">Take your bearings.</h1>
        <p>Your oxygen, energy, and mission clock are paused. Resume when you are ready.</p>
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" autoFocus onClick={() => setPhase('playing')}>Resume expedition</button>
          <button className="mission-button" onClick={restart}>Restart mission</button><button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
      {phase === 'results' && <>
        <span className="mission-dialog__label">MISSION DEBRIEF</span>
        <h1 id="mission-dialog-title">{hud.status === 'success' ? 'Destination reached.' : 'Expedition ended.'}</h1>
        <p>{hud.status === 'success' ? 'You reached extraction beacon B. Review the journey you actually took.' : `${hud.failure}. Try another approach or leave more reserve for the journey.`}</p>
        <div className="mission-score"><strong>{score.total}</strong><span>mission points</span></div>
        <dl className="mission-dialog__facts mission-dialog__facts--results">
          <div><dt>Distance walked</dt><dd>{meters(hud.distance)}</dd></div><div><dt>Mission time</dt><dd>{clock(hud.elapsed)}</dd></div>
          <div><dt>Oxygen / Energy</dt><dd>{Math.ceil(hud.oxygen)}% / {Math.ceil(hud.energy)}%</dd></div>
          <div><dt>Science scans</dt><dd>{hud.scans.length} (+{hud.scans.length * 20})</dd></div>
          <div><dt>Efficiency bonus</dt><dd>+{score.efficiency}</dd></div><div><dt>Risk penalty</dt><dd>−{score.riskPenalty}</dd></div>
        </dl>
        <p className="mission-dialog__note">Shortest planned: {meters(recommended)}. Actual travel: {meters(hud.distance)}. Route guidance does not constrain where you walk. Risk is a gameplay index, not a safety assessment.</p>
        {history.length > 1 && <div className="mission-history"><h2>Previous run</h2><p>{history[history.length - 2].success ? 'Completed' : 'Incomplete'} with {MODE_LABEL[history[history.length - 2].guide].toLowerCase()} guidance: {history[history.length - 2].score} points, {meters(history[history.length - 2].distance)}, {clock(history[history.length - 2].elapsed)}.</p></div>}
        <div className="mission-dialog__buttons"><button className="mission-button mission-button--primary" autoFocus onClick={restart}>Play again</button>
          <button className="mission-text-button" onClick={exit}>Back to planner</button></div>
      </>}
    </dialog>
  </section>;
}

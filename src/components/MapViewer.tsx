import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { imagePixelToGrid, gridToImagePixel, type TerrainImageMeta } from '../lib/data';
import type { GridPoint, RouteMode } from '../lib/router';
import { hitTestRoutes } from '../lib/routeHitTest';
import { MARKER_COLOR, MODE_COLOR } from '../lib/theme';
import { Icon } from './Icon';

export type MarkerSlot = 'A' | 'B';

interface ViewState {
  cx: number;
  cy: number;
  /** CSS pixels per image pixel. */
  zoom: number;
}

interface MapViewerProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  meta: TerrainImageMeta;
  image: HTMLImageElement;
  markers: Partial<Record<MarkerSlot, GridPoint>>;
  paths: { id: RouteMode; points: GridPoint[]; color: string; active: boolean; dashed: boolean }[];
  activeMarker: MarkerSlot | null;
  onCancelPlacement: () => void;
  onMapClick: (point: GridPoint, slot?: MarkerSlot) => void;
  onHover: (point: GridPoint | null) => void;
  onInspect: (point: GridPoint) => void;
  onSelectRoute: (mode: RouteMode) => void;
  slopeOverlay: HTMLCanvasElement | null;
  elevationOverlay: HTMLCanvasElement | null;
  showSlopeClasses: boolean;
  showElevation: boolean;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 24;
const ZOOM_STEP = 1.35;
const ARROWS: Record<string, GridPoint> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export function MapViewer({
  canvasRef, meta, image, markers, paths, activeMarker, onCancelPlacement, onMapClick, onHover, onInspect, onSelectRoute,
  slopeOverlay, elevationOverlay, showSlopeClasses, showElevation,
}: MapViewerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ cx: meta.width / 2, cy: meta.height / 2, zoom: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [pinUnderPointer, setPinUnderPointer] = useState<MarkerSlot | null>(null);
  const [routeHint, setRouteHint] = useState<{ id: RouteMode; x: number; y: number } | null>(null);
  const hoveredRoute = routeHint?.id ?? null;
  const [draggedPin, setDraggedPin] = useState<{ slot: MarkerSlot; point: GridPoint } | null>(null);
  const [keyboardCell, setKeyboardCell] = useState<GridPoint | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const dragRef = useRef<{
    id: number; x: number; y: number; cx: number; cy: number;
    pin: { slot: MarkerSlot; point: GridPoint } | null;
  } | null>(null);
  const movedRef = useRef(false);
  const hoverFrame = useRef(0);
  const userAdjustedRef = useRef(false);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([{ contentRect }]) => {
      setSize({ w: contentRect.width, h: contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const clampView = useCallback((next: ViewState): ViewState => {
    const halfW = size.w / 2 / next.zoom;
    const halfH = size.h / 2 / next.zoom;
    const cx = meta.width <= halfW * 2 ? meta.width / 2 : Math.min(meta.width - halfW, Math.max(halfW, next.cx));
    const cy = meta.height <= halfH * 2 ? meta.height / 2 : Math.min(meta.height - halfH, Math.max(halfH, next.cy));
    return { ...next, cx, cy };
  }, [meta.width, meta.height, size]);

  useEffect(() => {
    if (!size.w || !size.h) return;
    if (userAdjustedRef.current) {
      setView(clampView);
      return;
    }
    // Fit the square data on first load so both reference endpoints are visible.
    const zoom = Math.min(size.w / meta.width, size.h / meta.height);
    setView({ cx: meta.width / 2, cy: meta.height / 2, zoom });
  }, [size, meta.width, meta.height, clampView]);

  const screenPaths = useMemo(() => paths.map((path) => ({
    ...path,
    points: path.points.map((point) => {
      const pixel = gridToImagePixel(meta, point);
      return { x: (pixel.x - view.cx) * view.zoom + size.w / 2, y: (pixel.y - view.cy) * view.zoom + size.h / 2 };
    }),
  })), [paths, meta, view, size]);

  useEffect(() => { setRouteHint(null); }, [screenPaths, activeMarker]);

  // ---- drawing --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const { cx, cy, zoom } = view;
    // Image pixel -> CSS pixel.
    const toCss = (px: number, py: number) => ({
      x: (px - cx) * zoom + size.w / 2,
      y: (py - cy) * zoom + size.h / 2,
    });

    ctx.imageSmoothingEnabled = zoom < 2;

    const origin = toCss(0, 0);
    ctx.drawImage(image, origin.x, origin.y, meta.width * zoom, meta.height * zoom);

    // ---- overlays -----------------------------------------------------------
    if (showElevation && elevationOverlay) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(elevationOverlay, origin.x, origin.y, meta.width * zoom, meta.height * zoom);
      ctx.imageSmoothingEnabled = zoom < 2;
    }
    if (showSlopeClasses && slopeOverlay) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(slopeOverlay, origin.x, origin.y, meta.width * zoom, meta.height * zoom);
      ctx.imageSmoothingEnabled = zoom < 2;
    }

    // ---- grid lines ---------------------------------------------------------
    const cellPx = meta.pxPerCell * zoom;
    if (cellPx >= 6) {
      ctx.strokeStyle = 'rgba(255, 238, 214, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= meta.grid.width; c += 1) {
        const x = Math.round(toCss(c * meta.pxPerCell, 0).x) + 0.5;
        ctx.moveTo(x, origin.y);
        ctx.lineTo(x, origin.y + meta.height * zoom);
      }
      for (let r = 0; r <= meta.grid.height; r += 1) {
        const y = Math.round(toCss(0, r * meta.pxPerCell).y) + 0.5;
        ctx.moveTo(origin.x, y);
        ctx.lineTo(origin.x + meta.width * zoom, y);
      }
      ctx.stroke();
    }

    // ---- routes -------------------------------------------------------------
    // Hover previews the line above both routes without changing the selected mode.
    const priority = (path: typeof screenPaths[number]) => path.id === hoveredRoute ? 2 : Number(path.active);
    const ordered = [...screenPaths].sort((a, b) => priority(a) - priority(b));

    for (const path of ordered) {
      if (path.points.length === 0) continue;
      const pts = path.points;
      const hovering = path.id === hoveredRoute;

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = hovering || path.active ? 1 : 0.6;

      // A dark casing under the line keeps it readable over bright terrain.
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(10, 8, 7, 0.7)';
      ctx.lineWidth = hovering ? 10 : path.active ? 7 : 5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      ctx.setLineDash(path.dashed ? [9, 6] : []);
      ctx.strokeStyle = path.color;
      ctx.lineWidth = hovering ? 5 : path.active ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // ---- markers ------------------------------------------------------------
    const visibleMarkers = draggedPin ? { ...markers, [draggedPin.slot]: draggedPin.point } : markers;
    const sameCell = visibleMarkers.A && visibleMarkers.B &&
      visibleMarkers.A[0] === visibleMarkers.B[0] && visibleMarkers.A[1] === visibleMarkers.B[1];
    for (const slot of ['A', 'B'] as const) {
      const point = visibleMarkers[slot];
      if (!point) continue;
      const ip = gridToImagePixel(meta, point);
      const { x, y } = toCss(ip.x, ip.y);
      if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) continue;

      ctx.beginPath();
      ctx.arc(x + (sameCell ? slot === 'A' ? -12 : 12 : 0), y, 13, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLOR[slot];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.stroke();

      ctx.fillStyle = '#0b0908';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot, x + (sameCell ? slot === 'A' ? -12 : 12 : 0), y + 0.5);
    }
  }, [canvasRef, view, size, meta, markers, screenPaths, hoveredRoute, image, slopeOverlay, elevationOverlay, showSlopeClasses, showElevation, draggedPin]);


  const imagePoint = useCallback((x: number, y: number) => ({
    x: (x - size.w / 2) / view.zoom + view.cx,
    y: (y - size.h / 2) / view.zoom + view.cy,
  }), [size, view]);

  const pointFromPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const p = imagePoint(event.clientX - rect.left, event.clientY - rect.top);
    if (p.x >= meta.width || p.y >= meta.height) return null;
    return imagePixelToGrid(meta, p.x, p.y);
  };

  const pinAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = imagePoint(event.clientX - rect.left, event.clientY - rect.top);
    let nearest: { slot: MarkerSlot; point: GridPoint } | null = null;
    let limit = event.pointerType === 'touch' ? 22 : 17;
    const sameCell = markers.A && markers.B && markers.A[0] === markers.B[0] && markers.A[1] === markers.B[1];
    for (const slot of ['A', 'B'] as const) {
      const point = markers[slot];
      if (!point) continue;
      const pixel = gridToImagePixel(meta, point);
      const offset = sameCell ? slot === 'A' ? -12 : 12 : 0;
      const distance = Math.hypot((pointer.x - pixel.x) * view.zoom - offset, (pointer.y - pixel.y) * view.zoom);
      if (distance <= limit) {
        nearest = { slot, point };
        limit = distance;
      }
    }
    return nearest;
  };

  const dragCell = (pin: GridPoint, dx: number, dy: number) => {
    const { x, y } = gridToImagePixel(meta, pin);
    const nextX = x + dx / view.zoom;
    const nextY = y + dy / view.zoom;
    return nextX >= meta.width || nextY >= meta.height ? null : imagePixelToGrid(meta, nextX, nextY);
  };

  const routeAt = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activeMarker || pinAt(event)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return hitTestRoutes(screenPaths, { x: event.clientX - rect.left, y: event.clientY - rect.top },
      event.pointerType === 'touch' ? 18 : 9);
  };

  const clearHover = () => {
    cancelAnimationFrame(hoverFrame.current);
    setRouteHint(null);
    onHover(null);
  };

  useEffect(() => () => cancelAnimationFrame(hoverFrame.current), []);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    clearHover();
    setKeyboardVisible(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy,
      pin: pinAt(event),
    };
    movedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary) return;
    const drag = dragRef.current;
    if (drag?.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (movedRef.current || Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!movedRef.current) {
          setPanning(true);
          clearHover();
        }
        movedRef.current = true;
        if (drag.pin) {
          const point = dragCell(drag.pin.point, dx, dy);
          setDraggedPin(point ? { slot: drag.pin.slot, point } : null);
        } else {
          userAdjustedRef.current = true;
          setView((previous) => clampView({ ...previous, cx: drag.cx - dx / previous.zoom, cy: drag.cy - dy / previous.zoom }));
        }
        return;
      }
    }
    if (event.pointerType !== 'touch') {
      setPinUnderPointer(pinAt(event)?.slot ?? null);
      const point = pointFromPointer(event);
      const route = routeAt(event);
      const rect = event.currentTarget.getBoundingClientRect();
      cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = requestAnimationFrame(() => {
        setRouteHint(route ? { id: route, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
        onHover(point);
      });
    }
  };

  const handlePointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    setPanning(false);
    setDraggedPin(null);
    setPinUnderPointer(null);
    clearHover();
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const wasDrag = movedRef.current || Math.abs(dx) > 3 || Math.abs(dy) > 3;
    handlePointerCancel(event);
    if (wasDrag) {
      if (drag.pin) {
        const point = dragCell(drag.pin.point, dx, dy);
        if (point) onMapClick(point, drag.pin.slot);
      }
      return;
    }
    const selectedRoute = routeAt(event);
    if (selectedRoute) {
      onSelectRoute(selectedRoute);
      return;
    }
    const grid = pointFromPointer(event);
    if (grid) {
      if (drag.pin && !activeMarker) onInspect(drag.pin.point);
      else onMapClick(grid);
    }
  };

  const zoomBy = useCallback((factor: number, x = size.w / 2, y = size.h / 2) => {
    userAdjustedRef.current = true;
    setView((previous) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previous.zoom * factor));
      const anchor = 1 / previous.zoom - 1 / zoom;
      return clampView({
        zoom,
        cx: previous.cx + (x - size.w / 2) * anchor,
        cy: previous.cy + (y - size.h / 2) * anchor,
      });
    });
  }, [clampView, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasRef, zoomBy]);

  const coverView = () => {
    if (!size.w || !size.h) return;
    userAdjustedRef.current = true;
    const zoom = Math.max(size.w / meta.width, size.h / meta.height);
    setView(clampView({ cx: meta.width / 2, cy: meta.height / 2, zoom }));
  };

  const handleMapKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && activeMarker) {
      event.preventDefault();
      onCancelPlacement();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      coverView();
      return;
    }
    const arrow = ARROWS[event.key];
    if (!arrow && event.key !== 'Enter') return;
    event.preventDefault();
    clearHover();
    const centre = imagePixelToGrid(meta, view.cx, view.cy) ?? [0, 0];
    const cell = keyboardVisible && keyboardCell ? keyboardCell : centre;
    if (arrow && event.shiftKey) {
      userAdjustedRef.current = true;
      setKeyboardVisible(false);
      setView(clampView({ ...view, cx: view.cx + arrow[1] * 48 / view.zoom, cy: view.cy + arrow[0] * 48 / view.zoom }));
      return;
    }
    const target: GridPoint = arrow ? [
      Math.min(meta.grid.height - 1, Math.max(0, cell[0] + arrow[0])),
      Math.min(meta.grid.width - 1, Math.max(0, cell[1] + arrow[1])),
    ] : cell;
    setKeyboardCell(target);
    setKeyboardVisible(true);
    const pixel = gridToImagePixel(meta, target);
    const x = (pixel.x - view.cx) * view.zoom + size.w / 2;
    const y = (pixel.y - view.cy) * view.zoom + size.h / 2;
    if (x < 16 || x > size.w - 16 || y < 16 || y > size.h - 16) {
      userAdjustedRef.current = true;
      setView(clampView({ ...view, cx: pixel.x, cy: pixel.y }));
    }
    if (event.key === 'Enter') onMapClick(target);
    else onInspect(target);
  };

  const scale = useMemo(() => {
    const metresPerCssPx = meta.metersPerPx / view.zoom;
    const targets = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const metres = targets.filter((target) => target / metresPerCssPx <= 130).at(-1) ?? targets[0];
    return { metres, px: Math.round(metres / metresPerCssPx) };
  }, [meta.metersPerPx, view.zoom]);

  const keyboardPixel = keyboardVisible && keyboardCell ? gridToImagePixel(meta, keyboardCell) : null;
  return (
    <div className="map">
      <div className="map__viewport" ref={wrapRef} data-placing={Boolean(activeMarker)}
        data-grabbing={panning} data-pin={Boolean(pinUnderPointer)} data-route={Boolean(hoveredRoute)}>
        <canvas ref={canvasRef} className="map__canvas" tabIndex={0}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handlePointerCancel}
          onPointerLeave={() => { clearHover(); setPinUnderPointer(null); }} onKeyDown={handleMapKey}
          onBlur={() => setKeyboardVisible(false)}
          aria-label="Jezero terrain map" aria-describedby="map-keys" />
        <p id="map-keys" className="sr-only">Arrow keys inspect cells. Shift and arrows pan. Plus and minus zoom. Zero fills the view. Enter inspects or places the selected endpoint. Escape cancels placement. Row and column entry is available in Cell inspector.</p>
        {routeHint && <div className="map__route-hint" key={routeHint.id} aria-hidden="true" style={{
          left: Math.max(8, Math.min(size.w - 184, routeHint.x + 16)),
          top: routeHint.y > size.h - 56 ? routeHint.y - 48 : routeHint.y + 16,
          '--route-colour': MODE_COLOR[routeHint.id],
        } as CSSProperties}>
          <span />{paths.find((path) => path.id === routeHint.id)?.active
            ? (routeHint.id === 'shortest' ? 'Shortest selected' : 'Terrain-aware selected')
            : (routeHint.id === 'shortest' ? 'Show Shortest' : 'Show Terrain-aware')}
        </div>}
        {keyboardPixel && <span className="map__cursor" aria-hidden="true" style={{
          left: (keyboardPixel.x - view.cx) * view.zoom + size.w / 2,
          top: (keyboardPixel.y - view.cy) * view.zoom + size.h / 2,
        }} />}
        <div className="map__zoom" aria-label="Map zoom" role="group">
          <button type="button" className="icon-btn" onClick={() => zoomBy(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM}
            aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
          <button type="button" className="icon-btn" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.zoom <= MIN_ZOOM}
            aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
          <button type="button" className="icon-btn" onClick={coverView}
            aria-label="Fill view" title="Fill view"><Icon name="fill" /></button>
        </div>
        <div className="map__scale">
          <span className="map__scale-bar" style={{ width: scale.px }} aria-hidden="true" />
          <span className="number">{scale.metres >= 1000 ? scale.metres / 1000 : scale.metres}</span>
          <span className="unit">{scale.metres >= 1000 ? 'km' : 'm'}</span>
          <span className="sr-only"> projected</span>
        </div>
      </div>
    </div>
  );
}

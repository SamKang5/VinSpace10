import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridPoint } from '../lib/router';
import type { TerrainImageMeta } from '../lib/data';
import { imagePixelToGrid, gridToImagePixel } from '../lib/data';

export type MarkerSlot = 'A' | 'B';

export interface ViewState {
  /** Image pixel at the centre of the viewport. */
  cx: number;
  cy: number;
  /** Image pixels per CSS pixel. */
  zoom: number;
}

export interface MapViewerProps {
  meta: TerrainImageMeta;
  imageUrl: string;
  markers: Partial<Record<MarkerSlot, GridPoint>>;
  paths: {
    id: string;
    label: string;
    points: GridPoint[];
    color: string;
    /** The selected mode draws on top; the others recede but stay visible. */
    active: boolean;
  }[];
  activeMarker: MarkerSlot;
  onMapClick: (point: GridPoint) => void;
  /** Offscreen slope-class raster, drawn over the imagery when enabled. */
  slopeOverlay: HTMLCanvasElement | null;
  showSlopeClasses: boolean;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 24;

export function MapViewer({
  meta,
  imageUrl,
  markers,
  paths,
  activeMarker,
  onMapClick,
  slopeOverlay,
  showSlopeClasses,
}: MapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [view, setView] = useState<ViewState>({ cx: meta.width / 2, cy: meta.height / 2, zoom: 2 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const movedRef = useRef(false);
  // True once the user pans or zooms, so a resize must not override their view.
  const userAdjustedRef = useRef(false);

  // ---- image loading --------------------------------------------------------
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // ---- viewport size --------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- pointer interaction --------------------------------------------------
  const clampView = useCallback(
    (next: ViewState): ViewState => {
      const halfW = size.w / 2 / next.zoom;
      const halfH = size.h / 2 / next.zoom;
      // Keep the image covering the viewport when it is larger than the view.
      const cx =
        meta.width <= halfW * 2 ? meta.width / 2 : Math.min(meta.width - halfW, Math.max(halfW, next.cx));
      const cy =
        meta.height <= halfH * 2 ? meta.height / 2 : Math.min(meta.height - halfH, Math.max(halfH, next.cy));
      return { ...next, cx, cy };
    },
    [meta, size],
  );

  // Re-fill the frame when the viewport changes, unless the user has panned or
  // zoomed and taken control of the view.
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    if (userAdjustedRef.current) return;
    const zoom = Math.max(size.w / meta.width, size.h / meta.height);
    setView((v) => clampView({ ...v, cx: meta.width / 2, cy: meta.height / 2, zoom }));
  }, [size, meta, clampView]);

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

    const img = imageRef.current;
    if (!img) return;

    const { cx, cy, zoom } = view;
    // Image pixel -> CSS pixel.
    const toCss = (px: number, py: number) => ({
      x: (px - cx) * zoom + size.w / 2,
      y: (py - cy) * zoom + size.h / 2,
    });

    ctx.imageSmoothingEnabled = zoom < 2;

    const origin = toCss(0, 0);
    ctx.drawImage(img, origin.x, origin.y, meta.width * zoom, meta.height * zoom);

    // ---- slope classes -------------------------------------------------------
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
    for (const path of paths) {
      if (path.points.length === 0) continue;
      const pts = path.points.map((p) => {
        const ip = gridToImagePixel(meta, p);
        return toCss(ip.x, ip.y);
      });

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = path.active ? 1 : 0.45;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = path.active ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.active ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ---- markers ------------------------------------------------------------
    for (const slot of ['A', 'B'] as MarkerSlot[]) {
      const point = markers[slot];
      if (!point) continue;
      const ip = gridToImagePixel(meta, point);
      const { x, y } = toCss(ip.x, ip.y);
      if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) continue;

      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = slot === 'A' ? '#38bdf8' : '#fb923c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.stroke();

      ctx.fillStyle = '#0b0908';
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot, x, y + 0.5);
    }
  }, [view, size, meta, markers, paths, imageReady, slopeOverlay, showSlopeClasses]);

  // ---- pointer interaction --------------------------------------------------
  const imagePointFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const { cx, cy, zoom } = view;
      return {
        x: (clientX - rect.left - rect.width / 2) / zoom + cx,
        y: (clientY - rect.top - rect.height / 2) / zoom + cy,
      };
    },
    [view],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // setPointerCapture throws when the pointer is no longer active, which
    // must not stop the click from registering.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    movedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedRef.current = true;
      userAdjustedRef.current = true;
    }
    setView((v) => clampView({ ...v, cx: drag.cx - dx / v.zoom, cy: drag.cy - dy / v.zoom }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDrag = movedRef.current;
    dragRef.current = null;
    if (wasDrag) return;

    // A click places the active marker.
    const p = imagePointFromEvent(e.clientX, e.clientY);
    const grid = imagePixelToGrid(meta, p.x, p.y);
    if (grid) onMapClick(grid);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    userAdjustedRef.current = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      // Keep the point under the cursor fixed.
      const k = zoom / v.zoom;
      const cx = v.cx + (mx - size.w / 2) / v.zoom * (1 - 1 / k);
      const cy = v.cy + (my - size.h / 2) / v.zoom * (1 - 1 / k);
      return clampView({ cx, cy, zoom });
    });
  };

  const fitToView = useCallback(() => {
    if (size.w === 0 || size.h === 0) return;
    userAdjustedRef.current = true;
    const zoom = Math.min(size.w / meta.width, size.h / meta.height);
    setView(clampView({ cx: meta.width / 2, cy: meta.height / 2, zoom }));
  }, [meta, size, clampView]);

  /** Fill the frame with terrain, cropping the AOI edges rather than letterboxing. */
  const coverView = useCallback(() => {
    if (size.w === 0 || size.h === 0) return;
    userAdjustedRef.current = true;
    const zoom = Math.max(size.w / meta.width, size.h / meta.height);
    setView(clampView({ cx: meta.width / 2, cy: meta.height / 2, zoom }));
  }, [meta, size, clampView]);

  const zoomBy = (factor: number) => {
    userAdjustedRef.current = true;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      return clampView({ ...v, zoom });
    });
  };

  // Fill the frame with terrain when the image loads.
  useEffect(() => {
    coverView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageReady, meta]);

  const cursor = dragRef.current ? 'grabbing' : 'crosshair';
  const markerLabel = useMemo(() => (activeMarker === 'A' ? 'Start (A)' : 'End (B)'), [activeMarker]);

  return (
    <div className="map" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map__canvas"
        style={{ width: '100%', height: '100%', cursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        aria-label="Mars terrain map. Drag to pan, scroll to zoom, click to place the selected marker."
      />
      {!imageReady && <div className="map__loading">Loading Jezero terrain…</div>}
      <div className="map__hint">Click to place {markerLabel}</div>
      <ul className="map__legend" aria-label="Map legend">
        <li>
          <span className="map__swatch" style={{ background: '#38bdf8' }} aria-hidden="true" />
          Start (A)
        </li>
        <li>
          <span className="map__swatch" style={{ background: '#fb923c' }} aria-hidden="true" />
          End (B)
        </li>
        {paths.map((p) => (
          <li key={p.id} className={p.active ? 'is-active' : ''}>
            <span className="map__swatch map__swatch--line" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
          </li>
        ))}
      </ul>
      <div className="map__zoom">
        <button type="button" onClick={() => zoomBy(1.35)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={fitToView} aria-label="Fit the whole AOI in view">
          ⤢
        </button>
        <button type="button" onClick={coverView} aria-label="Fill the view with terrain">
          ▣
        </button>
      </div>
    </div>
  );
}

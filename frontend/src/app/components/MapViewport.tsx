/**
 * Interactive Mars map viewport (M1-02/M1-03).
 *
 * Renders the M2-04 terrain PNG inside a responsive viewport with pointer
 * panning, wheel zoom anchored at the cursor, fit/reset controls, and A/B
 * endpoint markers. All coordinate math lives in mapTransform.ts (pure) and
 * selection.ts (pure); this component only converts screen points to image
 * points and applies those pure functions, so marker alignment and click
 * mapping are stable under pan, zoom and CSS resizing by construction:
 * markers are reprojected from the SAME transform that draws the image.
 *
 * A click is only reported when the pointer moved less than a small drag
 * threshold between press and release, so panning never fires selections.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  imageToScreen,
  fitTransform,
  panBy,
  screenToImage,
  wheelZoomFactor,
  zoomAt,
  type Point,
  type Size,
  type ViewTransform,
} from "../mapTransform.ts";
import { cellCenterImagePoint, type GridCellRef } from "../selection.ts";
import type { ImageryMetadata } from "../imagery.ts";

const DRAG_CLICK_THRESHOLD_PX = 4;

export interface MapMarker {
  readonly role: "start" | "goal";
  readonly ref: GridCellRef;
}

interface MapViewportProps {
  readonly imageUrl: string;
  readonly imagery: ImageryMetadata;
  readonly markers: readonly MapMarker[];
  readonly armedHint: string | null;
  readonly onImageClick: (imagePoint: Point) => void;
  readonly onImageHover?: (imagePoint: Point | null) => void;
}

interface DragState {
  readonly pointerId: number;
  readonly lastScreen: Point;
  readonly moved: number;
}

export function MapViewport({ imageUrl, imagery, markers, armedHint, onImageClick, onImageHover }: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const fittedRef = useRef(false);
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const imageSize: Size = { width: imagery.width, height: imagery.height };

  // Track the responsive viewport size. Resizing does NOT mutate the
  // transform (image coordinates and marker alignment stay stable); only the
  // initial fit and the explicit reset action derive a transform from size.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      const box = entry.contentRect;
      setContainerSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Initial fit once both the image size and a real container size are known.
  useEffect(() => {
    if (!fittedRef.current && containerSize.width > 0 && containerSize.height > 0) {
      fittedRef.current = true;
      setTransform(fitTransform(imageSize, containerSize));
    }
  }, [containerSize, imageSize.width, imageSize.height]);

  // Wheel zoom must be non-passive so preventDefault can stop page scroll.
  useEffect(() => {
    const element = containerRef.current;
    if (element === null) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const screenPoint: Point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
      setTransform((current) => zoomAt(current, screenPoint, factor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const screenPointFromEvent = useCallback((event: { clientX: number; clientY: number }): Point => {
    const element = containerRef.current;
    if (element === null) {
      return { x: Number.NaN, y: Number.NaN };
    }
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const point = screenPointFromEvent(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    dragRef.current = { pointerId: event.pointerId, lastScreen: point, moved: 0 };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag !== null && event.pointerId === drag.pointerId) {
      const point = screenPointFromEvent(event);
      const dx = point.x - drag.lastScreen.x;
      const dy = point.y - drag.lastScreen.y;
      dragRef.current = {
        ...drag,
        lastScreen: point,
        moved: drag.moved + Math.hypot(dx, dy),
      };
      setTransform((current) => panBy(current, dx, dy));
      return;
    }
    if (event.buttons === 0) {
      const imagePoint = screenToImage(transform, screenPointFromEvent(event));
      onImageHover?.(imagePoint);
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>, isCancel: boolean) => {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    dragRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (isCancel || drag.moved >= DRAG_CLICK_THRESHOLD_PX) {
      return; // a pan, not a click
    }
    const imagePoint = screenToImage(transform, screenPointFromEvent(event));
    if (Number.isFinite(imagePoint.x) && Number.isFinite(imagePoint.y)) {
      onImageClick(imagePoint);
    }
  };

  const onPointerLeave = () => {
    onImageHover?.(null);
  };

  const zoomButton = (factor: number) => {
    setTransform((current) =>
      zoomAt(current, { x: containerSize.width / 2, y: containerSize.height / 2 }, factor),
    );
  };

  const resetView = () => {
    setTransform(fitTransform(imageSize, containerSize));
  };

  const cursorStyle = isPanning ? "grabbing" : "crosshair";

  return (
    <div
      ref={containerRef}
      className="map-viewport"
      style={{ cursor: cursorStyle, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishPointer(e, false)}
      onPointerCancel={(e) => finishPointer(e, true)}
      onPointerLeave={onPointerLeave}
      role="application"
      aria-label="Mars terrain map: drag to pan, scroll to zoom, click to select a grid cell"
    >
      <div
        className="map-transform-layer"
        style={{
          transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <img
          className="map-image"
          src={imageUrl}
          width={imagery.width}
          height={imagery.height}
          alt="Mars CTX terrain mosaic over the navigation grid footprint"
          draggable={false}
        />
      </div>

      {/* A/B markers are positioned in viewport space from the same transform
          that draws the image, so they stay aligned while panning/zooming and
          keep a constant, readable on-screen size. */}
      {markers.map((marker) => {
        const imagePoint = cellCenterImagePoint(imagery, marker.ref);
        const screen = imageToScreen(transform, imagePoint);
        return (
          <div
            key={marker.role}
            className={`map-marker marker-${marker.role}`}
            style={{ left: `${screen.x}px`, top: `${screen.y}px` }}
            data-role={marker.role}
            data-row={marker.ref.row}
            data-col={marker.ref.col}
          >
            <span className="marker-badge">{marker.role === "start" ? "A" : "B"}</span>
          </div>
        );
      })}

      {armedHint !== null ? <div className="armed-hint">{armedHint}</div> : null}

      <div className="map-controls">
        <button type="button" onClick={() => zoomButton(1.5)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomButton(1 / 1.5)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={resetView} aria-label="Reset view">
          ⤢
        </button>
      </div>

      <div className="map-scale-readout">{transform.scale.toFixed(3)}× · {imagery.width}×{imagery.height} px</div>
    </div>
  );
}

import type { RouteMode } from './router.ts';

export interface ScreenPoint { x: number; y: number }

/** CSS-pixel tolerance stays usable at every zoom; ties follow the visible top route. */
export function hitTestRoutes(
  paths: { id: RouteMode; active: boolean; points: ScreenPoint[] }[],
  pointer: ScreenPoint,
  radius: number,
): RouteMode | null {
  let nearest: RouteMode | null = null;
  let limit = radius * radius;
  for (const path of [...paths].sort((a, b) => Number(a.active) - Number(b.active))) {
    for (let i = 0; i < path.points.length; i += 1) {
      const a = path.points[Math.max(0, i - 1)];
      const b = path.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / length)) : 0;
      const distance = (pointer.x - a.x - t * dx) ** 2 + (pointer.y - a.y - t * dy) ** 2;
      if (distance <= limit) {
        nearest = path.id;
        limit = distance;
      }
    }
  }
  return nearest;
}

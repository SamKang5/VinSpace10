// The route modes' colours and labels, in one place.
//
// The map, the panel and the comparison cards all need the same two colours;
// keeping them here stops one of them drifting.

import type { RouteMode } from './router';

export const MODE_COLOR: Record<RouteMode, string> = {
  shortest: '#38bdf8',
  'terrain-aware': '#f0a9da',
};

/**
 * The terrain-aware route is dashed, so the two routes stay distinguishable
 * even where they overlap and in a greyscale screenshot.
 */
export const MODE_DASHED: Record<RouteMode, boolean> = {
  shortest: false,
  'terrain-aware': true,
};

export const MODE_LABEL: Record<RouteMode, string> = {
  shortest: 'Shortest path',
  'terrain-aware': 'Terrain-aware path',
};

/** The endpoint markers, on the map and in the panel. */
export const MARKER_COLOR: Record<'A' | 'B', string> = {
  A: '#38bdf8',
  B: '#fb923c',
};

export const MODE_ORDER: RouteMode[] = ['shortest', 'terrain-aware'];

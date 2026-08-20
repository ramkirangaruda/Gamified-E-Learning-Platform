// Pure geometry for the winding level path (Trail.tsx) -- no React, no DOM, so the shape
// of the curve and which segments get drawn can be checked without rendering anything.
//
// Coordinate system: x is in "viewBox percent" units (0-100, mapped 1:1 to % of the
// container's width by the SVG's viewBox + preserveAspectRatio="none"), y is real pixels.
// That split is what makes this responsive without a resize observer -- x always tracks
// the container width, y is a fixed, predictable ladder of rows.
//
// The path travels HORIZONTALLY first: each row runs the full usable width, left-to-right
// then right-to-left on alternating rows (a boustrophedon/snake, same row concept the grid
// layout used before this went curvy), with a gentle vertical arc within each row so it
// still reads as an "S", not straight rules -- rather than a mostly-vertical wiggle down a
// narrow column that leaves most of a wide screen empty.

export const TRAIL_LEVELS_PER_ROW = 5;
export const TRAIL_X_MARGIN = 8; // viewBox %, keeps node centers off the very edge
export const TRAIL_ROW_HEIGHT = 190; // px between row baselines
export const TRAIL_ROW_ARC = 46; // px, how far a row bows up/down at its midpoint
export const TRAIL_TOP_PADDING = 90; // px before the first row's baseline

export interface TrailPoint {
  x: number;
  y: number;
}

/** Where level `index` (0-based) sits on the winding path. Rows alternate direction
 *  (row 0 left-to-right, row 1 right-to-left, ...) so the last node of one row and the
 *  first node of the next always land at the same x -- the path threads straight down
 *  into the next row instead of jumping across the screen. */
export function nodePosition(index: number): TrailPoint {
  const row = Math.floor(index / TRAIL_LEVELS_PER_ROW);
  const posInRow = index % TRAIL_LEVELS_PER_ROW;
  const reversed = row % 2 === 1;
  const t = TRAIL_LEVELS_PER_ROW > 1 ? posInRow / (TRAIL_LEVELS_PER_ROW - 1) : 0;
  const effectiveT = reversed ? 1 - t : t;

  const x = TRAIL_X_MARGIN + effectiveT * (100 - 2 * TRAIL_X_MARGIN);
  // Bows the row gently up or down at its midpoint, alternating per row, so consecutive
  // rows read as one continuous S rather than a flat shelf between two curves.
  const arcDirection = row % 2 === 0 ? 1 : -1;
  const arc = Math.sin(effectiveT * Math.PI) * TRAIL_ROW_ARC * arcDirection;
  const y = TRAIL_TOP_PADDING + row * TRAIL_ROW_HEIGHT + arc;

  return { x, y };
}

export function trailHeight(levelCount: number): number {
  if (levelCount === 0) return 0;
  const rows = Math.ceil(levelCount / TRAIL_LEVELS_PER_ROW);
  return TRAIL_TOP_PADDING * 2 + (rows - 1) * TRAIL_ROW_HEIGHT + TRAIL_ROW_ARC;
}

/** Catmull-Rom-through-points, converted to a cubic-bezier SVG path string (tension 1/6,
 *  the standard conversion) -- a smooth curve that actually passes through every given
 *  point, unlike a naive bezier-per-segment which only touches the endpoints. */
export function smoothPath(points: TrailPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * The two path segments to actually draw, given how many levels are solved.
 *
 * Takes `solvedCount`, not the "current" index, deliberately: solved levels are always
 * contiguous from the start (a solved level is never locked -- see Trail.tsx's lock
 * rule), so `solvedCount` alone tells you exactly which nodes are done, with no ambiguity
 * about the "everything solved" edge case the way reusing `current` (which clamps to the
 * last index once nothing is left to unlock) would have.
 *
 * `walked`: through every solved level (0..solvedCount-1). Rendered as the "done" path.
 * `next`: the one segment from the last solved level into the first unsolved one -- the
 * single step still open to take. Empty once nothing is left to walk toward (all solved,
 * or nothing solved yet -- level 1 starts open with no path behind it).
 * Nothing is returned for anything beyond that: per the brief, an unreached level gets no
 * path at all, not a faded or dashed placeholder.
 */
export function trailSegments(levelCount: number, solvedCount: number): { walked: TrailPoint[]; next: TrailPoint[] } {
  const points = Array.from({ length: levelCount }, (_, i) => nodePosition(i));
  const bounded = Math.max(0, Math.min(solvedCount, levelCount));

  const walked = points.slice(0, bounded);
  const nextIndex = bounded;
  const next = bounded > 0 && nextIndex < levelCount ? [points[bounded - 1], points[nextIndex]] : [];

  return { walked, next };
}

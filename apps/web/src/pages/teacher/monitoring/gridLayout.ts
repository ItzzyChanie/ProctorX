/**
 * Layout rules for the live monitoring wall.
 *
 * Fewer tiles per page means the teacher's browser decodes fewer video
 * streams (tiles on other pages are paused), so each one can be bigger and,
 * for very small walls, sent at full quality.
 */

/** Tiles per page offered to the teacher; 0 means "show all". */
export const PAGE_SIZE_OPTIONS = [1, 2, 4, 6, 9, 12, 16, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = 9;

/** At or below this many tiles on screen, visible feeds use full quality. */
export const FOCUS_QUALITY_MAX_TILES = 4;

/** Manual tile sizes (minimum tile width in px); AUTO fits tiles to the page. */
export const TILE_MIN_WIDTH = { S: 200, M: 300, L: 440 } as const;
export type TileSize = 'AUTO' | keyof typeof TILE_MIN_WIDTH;

const MIN_AUTO_TILE_WIDTH = 260;
const GAP = 12; // matches the grid's gap-3
/** Header, toolbar and pager above the wall (approximate). */
const CHROME_HEIGHT = 300;

/**
 * Columns for the AUTO layout: 1 → 1, 2 → 2, 3 → 3, 4 → 2×2, 6 → 3×2,
 * 9 → 3×3, 12/16 → 4 columns..., never more than fit the container width.
 * For walls of up to 9 tiles, `maxWidth` shrinks the grid so every row of
 * 16:9 tiles fits on screen without scrolling.
 */
export function autoGrid(
  count: number,
  containerWidth: number,
  viewportHeight: number
): { columns: number; maxWidth?: number } {
  if (count <= 0 || containerWidth <= 0) return { columns: 1 };
  const fitsAcross = Math.max(
    1,
    Math.floor((containerWidth + GAP) / (MIN_AUTO_TILE_WIDTH + GAP))
  );
  const ideal = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const columns = Math.max(1, Math.min(fitsAcross, ideal));
  if (count > 9) return { columns };

  const rows = Math.ceil(count / columns);
  const availableHeight = Math.max(240, viewportHeight - CHROME_HEIGHT);
  const tileHeight = (availableHeight - GAP * (rows - 1)) / rows;
  const tileWidth = (tileHeight * 16) / 9;
  // On short or narrow screens (phones), fitting every row on screen would
  // make tiles unreadably small: keep them full width and let the page scroll.
  if (tileWidth < MIN_AUTO_TILE_WIDTH) return { columns };
  const maxWidth = Math.round(tileWidth * columns + GAP * (columns - 1));
  return maxWidth < containerWidth ? { columns, maxWidth } : { columns };
}

/** Reads a saved preference, ignoring storage errors (private mode, etc.). */
export function readPreference<T>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw) as T;
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function savePreference(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

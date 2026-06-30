// ─────────────────────────────────────────────────────────────────────────────
// Board Layout — generic visual layout contract (shared source of truth)
//
// These types describe the *placement* of game pieces on top of a printed board
// image. They are purely presentational: no game engine reads them. They are
// shared so the client (visual editor) and the server (dev-only disk persistence)
// agree on the exact JSON shape exchanged over the `board:layout:save` socket
// event.
//
// Coordinates are expressed as **percentages of the board stage** (not pixels) so
// pieces scale correctly at any viewport width. An anchor is a *center point*:
// `leftPct` = % of stage width, `topPct` = % of stage height.
//
// This module is intentionally game-agnostic. Each game keeps its own
// `createBoardLayout()` defaults on the client and maps them onto these generic
// structures. Jaipur is the first consumer.
// ─────────────────────────────────────────────────────────────────────────────

/** A single center point on the board stage, in percentage units (0–100). */
export interface Anchor {
  /** Vertical center as a % of the stage height. */
  topPct: number;
  /** Horizontal center as a % of the stage width. */
  leftPct: number;
}

/**
 * How an anchored item is sized and rendered. Extend this union as new piece
 * families appear; the editor uses it to pick the right size knob (card vs token)
 * and the right drag handle.
 */
export type LayoutItemKind = 'card' | 'token' | 'zone';

/**
 * A single named, draggable placement as the editor sees it: a stable id, the
 * kind of piece, and its center anchor. This is the flattened, editor-facing view
 * derived from a {@link BoardLayout}; the persisted layout stores anchors keyed by
 * id (see {@link BoardLayout.anchors}).
 */
export interface BoardLayoutItem {
  /** Stable, unique key (e.g. `'deck'`, `'market-0'`, `'goods.diamonds'`). */
  id: string;
  /** Determines sizing/rendering of the piece at this anchor. */
  kind: LayoutItemKind;
  /** Center position of the piece. */
  anchor: Anchor;
}

/**
 * A complete, serializable snapshot of every placement value on a board. This is
 * exactly what travels over the wire and what gets written to the dev-only JSON
 * sidecar on disk. It is fully game-agnostic — both dimensions are open
 * dictionaries so any board game can describe its own pieces:
 *
 * - `scales` holds named numeric knobs (sizes, offsets), interpreted by the game
 *   (typically a % of the stage width, e.g. `cardWPct`, `tokenWPct`, or a px
 *   `tokenStackOffset`). No specific key is mandated.
 * - `anchors` holds named placements keyed by item id. A value is either a single
 *   {@link Anchor} or an ordered list (e.g. Jaipur's 5 market slots).
 * - `parents` (optional) describes a parent/child hierarchy: `childId → parentId`.
 *   When present, the layout editor drags a container's whole subtree together.
 */
export interface BoardLayout {
  /** Named scalar knobs (sizes/offsets), interpreted by the game. */
  scales: Record<string, number>;
  /** Named placements: `id → anchor` (single) or `id → anchor[]` (ordered group). */
  anchors: Record<string, Anchor | Anchor[]>;
  /** Optional hierarchy: maps a child element id to its parent (container) id. */
  parents?: Record<string, string>;
}

// ── Socket event contract: `board:layout:save` ───────────────────────────────

/**
 * Payload the client emits to persist a layout to the dev disk. `gameId` is a
 * stable slug (e.g. `'jaipur'`) the server validates against {@link GAME_ID_PATTERN}
 * before resolving any path.
 */
export interface BoardLayoutSavePayload {
  gameId: string;
  layout: BoardLayout;
}

/**
 * Server acknowledgment for a save attempt. Follows the repo's `ok`-flag callback
 * convention. On success, `writtenPath` is the repo-relative path written; on
 * failure, `error` is a human-readable (Spanish) message safe to show in the UI.
 */
export interface BoardLayoutSaveResult {
  ok: boolean;
  writtenPath?: string;
  error?: string;
}

// ── Runtime validation (pure TS, no external deps) ────────────────────────────
//
// The server cannot trust an incoming socket payload, so these guards let it
// validate the shape and reject path-traversal attempts before touching the disk.
// Implemented as hand-rolled type guards to keep `@gamengine/shared` dependency-free
// and Node/DOM-free, matching the rest of the package.

/** Allowed shape of a game slug: lowercase alphanumerics and dashes only. */
export const GAME_ID_PATTERN = /^[a-z0-9-]+$/;

/** Max length for a game slug, to bound the validated input. */
export const GAME_ID_MAX_LENGTH = 64;

/** True when `id` is a safe game slug (non-empty, bounded, pattern-matching). */
export function isValidGameId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= GAME_ID_MAX_LENGTH &&
    GAME_ID_PATTERN.test(id)
  );
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** True when `v` is a valid {@link Anchor}. */
export function isAnchor(v: unknown): v is Anchor {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return isFiniteNumber(a['topPct']) && isFiniteNumber(a['leftPct']);
}

function isAnchorOrList(v: unknown): v is Anchor | Anchor[] {
  return Array.isArray(v) ? v.every(isAnchor) : isAnchor(v);
}

/** True when `v` is a structurally valid {@link BoardLayout}. */
export function isBoardLayout(v: unknown): v is BoardLayout {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  const scales = l['scales'];
  if (typeof scales !== 'object' || scales === null) return false;
  if (!Object.values(scales as Record<string, unknown>).every(isFiniteNumber)) return false;
  const anchors = l['anchors'];
  if (typeof anchors !== 'object' || anchors === null) return false;
  return Object.values(anchors as Record<string, unknown>).every(isAnchorOrList);
}

/** True when `v` is a valid {@link BoardLayoutSavePayload} ready to persist. */
export function isBoardLayoutSavePayload(v: unknown): v is BoardLayoutSavePayload {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return isValidGameId(p['gameId']) && isBoardLayout(p['layout']);
}

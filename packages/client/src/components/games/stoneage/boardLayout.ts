import type { Anchor, BoardLayout } from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age board layout — maps straight onto the generic shared `BoardLayout`
// ({ scales, anchors }). Anchors are center points (% of the board canvas, which
// uses `extras/board.jpg` as its background) for the placeable table elements:
//   • `hut_pile_0..3`  → the 4 stacks of building tiles.
//   • `civ_card_0..3`  → the 4 civilization-card market spaces.
//
// Calibrate live with `?edit=true`: drag pieces, Ctrl/⌘+S to persist into
// `layout.json` (server sidecar) → Vite HMR re-ingests it. Defaults below are a
// rough first guess over the artwork; expect to drag them into place.
// ─────────────────────────────────────────────────────────────────────────────

export type StoneAgeBoardLayout = BoardLayout

export const STONEAGE_LS_KEY = 'stoneage-board-layout'

/** The root container id — the main board. Selecting it (a click on empty
 *  stage space) lets you move/scale the whole board; it parents every piece. */
export const STONEAGE_ROOT_ID = 'board_root'

/** Max player-board zones the editor knows about (one per seat, up to 4). */
export const STONEAGE_PLAYER_BOARD_IDS = [
  'player_board_0', 'player_board_1', 'player_board_2', 'player_board_3',
] as const

/** Meeple counter zones — one per seat, independently draggable. */
export const STONEAGE_MEEPLE_IDS = [
  'meeple_0', 'meeple_1', 'meeple_2', 'meeple_3',
] as const

/** Ordered ids the editor exposes as draggable zones. */
export const STONEAGE_ZONE_IDS = [
  'hut_pile_0', 'hut_pile_1', 'hut_pile_2', 'hut_pile_3',
  'civ_card_0', 'civ_card_1', 'civ_card_2', 'civ_card_3',
  ...STONEAGE_PLAYER_BOARD_IDS,
  ...STONEAGE_MEEPLE_IDS,
] as const

// Legacy group-scale keys (pre multi-selection). Kept only for migration so old
// sidecars/scratchpads seed every element with its former group value.
const LEGACY_HUT_SCALE_KEY = 'hutScale'
const LEGACY_CIV_SCALE_KEY = 'civScale'
const LEGACY_CARD_SCALE_KEY = 'cardScale'

/** A zone id belongs to the hut group (vs. the civ-card group). */
export function isHutZone(id: string): boolean {
  return id.startsWith('hut_pile_')
}

/**
 * Factory defaults (the reset target + what the baseline `layout.json` mirrors).
 * Every element carries its own scale under `scales[id]`, defaulting to 1.
 */
export function createStoneAgeLayout(): StoneAgeBoardLayout {
  const parents: Record<string, string> = {}
  // Huts, civ cards and player boards are children of board_root.
  for (const id of [
    'hut_pile_0','hut_pile_1','hut_pile_2','hut_pile_3',
    'civ_card_0','civ_card_1','civ_card_2','civ_card_3',
    ...STONEAGE_PLAYER_BOARD_IDS,
  ]) parents[id] = STONEAGE_ROOT_ID
  // Meeples are children of their respective player board so they travel
  // with it when the board is dragged, but can be moved independently.
  for (let i = 0; i < 4; i++) parents[`meeple_${i}`] = `player_board_${i}`

  return {
    scales: Object.fromEntries([STONEAGE_ROOT_ID, ...STONEAGE_ZONE_IDS].map(id => [id, 1])),
    anchors: {
      board_root:     { topPct: 50, leftPct: 50 },
      hut_pile_0:     { topPct: 26, leftPct: 36 },
      hut_pile_1:     { topPct: 24, leftPct: 53 },
      hut_pile_2:     { topPct: 24, leftPct: 75 },
      hut_pile_3:     { topPct: 45, leftPct: 73 },
      civ_card_0:     { topPct: 66, leftPct: 57 },
      civ_card_1:     { topPct: 66, leftPct: 68 },
      civ_card_2:     { topPct: 66, leftPct: 79 },
      civ_card_3:     { topPct: 66, leftPct: 90 },
      player_board_0: { topPct: 14, leftPct: 92 },
      player_board_1: { topPct: 38, leftPct: 92 },
      player_board_2: { topPct: 62, leftPct: 92 },
      player_board_3: { topPct: 86, leftPct: 92 },
      // Meeples default to the upper-left corner of their player board.
      meeple_0:       { topPct: 10, leftPct: 89 },
      meeple_1:       { topPct: 34, leftPct: 89 },
      meeple_2:       { topPct: 58, leftPct: 89 },
      meeple_3:       { topPct: 82, leftPct: 89 },
    },
    parents,
  }
}

/** Read a single anchor (Stone Age uses no anchor arrays). */
export function getStoneAgeAnchor(L: StoneAgeBoardLayout, id: string): Anchor | undefined {
  const v = L.anchors[id]
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

/** Return a new layout with one anchor replaced. */
export function setStoneAgeAnchor(L: StoneAgeBoardLayout, id: string, a: Anchor): StoneAgeBoardLayout {
  return { ...L, anchors: { ...L.anchors, [id]: a } }
}

/**
 * Direct children of `id` per the layout's `parents` map (childId → parentId).
 * Used by the editor's hierarchy adapter so dragging a container carries its
 * subtree; the hook recurses for grandchildren on its own.
 */
export function getStoneAgeChildren(L: StoneAgeBoardLayout, id: string): string[] {
  const parents = L.parents
  if (!parents) return []
  return Object.keys(parents).filter(child => parents[child] === id)
}

/** Resolve a scale value (defaulting to 1) for any of the scales.* keys. */
function readScale(L: StoneAgeBoardLayout, key: string): number {
  const v = L.scales[key]
  return typeof v === 'number' ? v : 1
}

/** Hard floor/ceiling for any element scale. 0.1 = never below 10% of base. */
export const STONEAGE_SCALE_MIN = 0.1
export const STONEAGE_SCALE_MAX = 3.0
const SCALE_STEP = 0.1

/** Per-element scale for a given zone id (each element is independent). */
export function getStoneAgeElementScale(L: StoneAgeBoardLayout, id: string): number {
  return readScale(L, id)
}

/**
 * Editor `+ / -`: nudge the scale of a single element (by id). The hook calls
 * this once per selected element, so a marquee selection scales together.
 * Clamped to [STONEAGE_SCALE_MIN, STONEAGE_SCALE_MAX] so nothing can be zoomed
 * below 10% of its base size.
 */
export function scaleStoneAgeElement(L: StoneAgeBoardLayout, id: string, dir: 1 | -1): StoneAgeBoardLayout {
  const raw  = readScale(L, id) + dir * SCALE_STEP
  const next = Math.min(STONEAGE_SCALE_MAX, Math.max(STONEAGE_SCALE_MIN, Math.round(raw * 100) / 100))
  return { ...L, scales: { ...L.scales, [id]: next } }
}

/**
 * Deep-merge a (possibly partial / stale) shared layout over the factory
 * defaults. Migrates legacy group scales (`hutScale`/`civScale`/`cardScale`)
 * into per-element scales when no per-element value is present.
 */
export function fromStoneAgeShared(shared: Partial<StoneAgeBoardLayout> | undefined): StoneAgeBoardLayout {
  const d = createStoneAgeLayout()
  if (!shared) return d

  const incoming = shared.scales ?? {}
  const legacyHut  = typeof incoming[LEGACY_HUT_SCALE_KEY]  === 'number' ? incoming[LEGACY_HUT_SCALE_KEY]  as number : undefined
  const legacyCiv  = typeof incoming[LEGACY_CIV_SCALE_KEY]  === 'number' ? incoming[LEGACY_CIV_SCALE_KEY]  as number : undefined
  const legacyCard = typeof incoming[LEGACY_CARD_SCALE_KEY] === 'number' ? incoming[LEGACY_CARD_SCALE_KEY] as number : undefined

  const scales: Record<string, number> = { ...d.scales }

  // board_root is not in STONEAGE_ZONE_IDS but must be migrated too.
  if (typeof incoming[STONEAGE_ROOT_ID] === 'number') {
    scales[STONEAGE_ROOT_ID] = incoming[STONEAGE_ROOT_ID] as number
  }

  for (const id of STONEAGE_ZONE_IDS) {
    if (typeof incoming[id] === 'number') {
      scales[id] = incoming[id] as number                 // explicit per-element wins
    } else if (isHutZone(id) && (legacyHut ?? legacyCard) !== undefined) {
      scales[id] = (legacyHut ?? legacyCard) as number     // seed from old hut group
    } else if (!isHutZone(id) && (legacyCiv ?? legacyCard) !== undefined) {
      scales[id] = (legacyCiv ?? legacyCard) as number     // seed from old civ group
    }
  }

  return {
    scales,
    anchors: { ...d.anchors, ...(shared.anchors ?? {}) },
    // Default hierarchy from the factory, overlaid by any declared in the
    // sidecar/scratchpad (so old sidecars still get the board → pieces tree).
    parents: { ...d.parents, ...(shared.parents ?? {}) },
  }
}

/** Editor plain-`S`: dump the layout to the console (copy-paste-ready). */
export function exportStoneAgeLayout(L: StoneAgeBoardLayout): void {
  try { localStorage.setItem(STONEAGE_LS_KEY, JSON.stringify(L)) } catch {}
  // eslint-disable-next-line no-console
  console.log('[StoneAge boardLayout]\n' + JSON.stringify(L, null, 2))
}

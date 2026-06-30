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

/** Ordered ids the editor exposes as draggable zones. */
export const STONEAGE_ZONE_IDS = [
  'hut_pile_0', 'hut_pile_1', 'hut_pile_2', 'hut_pile_3',
  'civ_card_0', 'civ_card_1', 'civ_card_2', 'civ_card_3',
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
  return {
    scales: Object.fromEntries(STONEAGE_ZONE_IDS.map(id => [id, 1])),
    anchors: {
      // 4 hut piles — rough guess across the upper terrain bands.
      hut_pile_0: { topPct: 26, leftPct: 36 },
      hut_pile_1: { topPct: 24, leftPct: 53 },
      hut_pile_2: { topPct: 24, leftPct: 75 },
      hut_pile_3: { topPct: 45, leftPct: 73 },
      // 4 civilization-card market spaces — the framed row on the lower right.
      civ_card_0: { topPct: 66, leftPct: 57 },
      civ_card_1: { topPct: 66, leftPct: 68 },
      civ_card_2: { topPct: 66, leftPct: 79 },
      civ_card_3: { topPct: 66, leftPct: 90 },
    },
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

/** Resolve a scale value (defaulting to 1) for any of the scales.* keys. */
function readScale(L: StoneAgeBoardLayout, key: string): number {
  const v = L.scales[key]
  return typeof v === 'number' ? v : 1
}

/** Per-element scale for a given zone id (each element is independent). */
export function getStoneAgeElementScale(L: StoneAgeBoardLayout, id: string): number {
  return readScale(L, id)
}

/**
 * Editor `+ / -`: nudge the scale of a single element (by id). The hook calls
 * this once per selected element, so a marquee selection scales together.
 */
export function scaleStoneAgeElement(L: StoneAgeBoardLayout, id: string, dir: 1 | -1): StoneAgeBoardLayout {
  const next = Math.min(2.5, Math.max(0.4, Math.round((readScale(L, id) + dir * 0.1) * 100) / 100))
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
  }
}

/** Editor plain-`S`: dump the layout to the console (copy-paste-ready). */
export function exportStoneAgeLayout(L: StoneAgeBoardLayout): void {
  try { localStorage.setItem(STONEAGE_LS_KEY, JSON.stringify(L)) } catch {}
  // eslint-disable-next-line no-console
  console.log('[StoneAge boardLayout]\n' + JSON.stringify(L, null, 2))
}

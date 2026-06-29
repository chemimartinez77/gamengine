import type { Anchor, BoardLayout } from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Virus! board layout — maps straight onto the generic shared `BoardLayout`
// ({ scales, anchors }). Anchors are center points (% of the board stage) for the
// structural table elements: the draw deck, the discard pile, and the four player
// seats (`player_0` = local player, `player_1..3` = opponents/bots).
//
// Calibrate live with `?edit=true`: drag pieces, Ctrl/⌘+S to persist into
// `layout.json` (server sidecar) → Vite HMR re-ingests it. No background image,
// so there is no magnifier here.
// ─────────────────────────────────────────────────────────────────────────────

export type VirusBoardLayout = BoardLayout

export const VIRUS_LS_KEY = 'virus-board-layout'

/** Ordered ids the editor exposes as draggable zones. */
export const VIRUS_ZONE_IDS = [
  'player_1', 'player_2', 'player_3', 'deck', 'discard', 'player_0',
] as const

/** Factory defaults (the reset target + the baseline `layout.json` was built from). */
export function createVirusLayout(): VirusBoardLayout {
  return {
    scales: { cardScale: 1 },
    anchors: {
      // Opponents across the top.
      player_1: { topPct: 15, leftPct: 18 },
      player_2: { topPct: 15, leftPct: 50 },
      player_3: { topPct: 15, leftPct: 82 },
      // Central table: draw deck + discard.
      deck:     { topPct: 46, leftPct: 43 },
      discard:  { topPct: 46, leftPct: 57 },
      // Local player at the bottom.
      player_0: { topPct: 80, leftPct: 50 },
    },
  }
}

/** Read a single anchor (Virus uses no anchor arrays). */
export function getVirusAnchor(L: VirusBoardLayout, id: string): Anchor | undefined {
  const v = L.anchors[id]
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

/** Return a new layout with one anchor replaced. */
export function setVirusAnchor(L: VirusBoardLayout, id: string, a: Anchor): VirusBoardLayout {
  return { ...L, anchors: { ...L.anchors, [id]: a } }
}

/** Current global card scale (drives deck/discard sizing). */
export function virusCardScale(L: VirusBoardLayout): number {
  const v = L.scales['cardScale']
  return typeof v === 'number' ? v : 1
}

/** Editor `+ / -`: nudge the global card scale (selection-agnostic). */
export function scaleVirusElement(L: VirusBoardLayout, _id: string, dir: 1 | -1): VirusBoardLayout {
  const next = Math.min(2, Math.max(0.4, Math.round((virusCardScale(L) + dir * 0.1) * 100) / 100))
  return { ...L, scales: { ...L.scales, cardScale: next } }
}

/** Deep-merge a (possibly partial / stale) shared layout over the factory defaults. */
export function fromVirusShared(shared: Partial<VirusBoardLayout> | undefined): VirusBoardLayout {
  const d = createVirusLayout()
  if (!shared) return d
  return {
    scales:  { ...d.scales,  ...(shared.scales  ?? {}) },
    anchors: { ...d.anchors, ...(shared.anchors ?? {}) },
  }
}

/** Editor plain-`S`: dump the layout to the console (copy-paste-ready). */
export function exportVirusLayout(L: VirusBoardLayout): void {
  try { localStorage.setItem(VIRUS_LS_KEY, JSON.stringify(L)) } catch {}
  // eslint-disable-next-line no-console
  console.log('[Virus boardLayout]\n' + JSON.stringify(L, null, 2))
}

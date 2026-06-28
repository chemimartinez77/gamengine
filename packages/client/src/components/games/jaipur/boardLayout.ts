import { useEffect, useRef, useState } from 'react'
import type { GoodsType, BonusTier } from '@gamengine/shared'

/**
 * Single source of truth for placing the Jaipur **shared central zone** (deck,
 * 5 market cards and the token supply) on top of the printed board image.
 *
 * To swap the board art: change `BOARD_IMAGE` (and `BOARD_RATIO` if the new
 * file has different proportions), then nudge the anchor percentages below to
 * line the pieces up with the printed slots. No component logic depends on
 * these numbers — they are purely visual placement.
 *
 * Anchors are **center points** expressed as a percentage of the board stage
 * (left → % of width, top → % of height). Pieces are centered on their anchor,
 * so "the diamond pile sits at 67% / 14%" reads literally.
 */

export const BOARD_IMAGE = '/jaipur/board/mesa-base.png'
export const BOARD_RATIO = 1292 / 851 // ≈ 1.518 (native pixel size of the PNG)

/** Card width as a % of the stage width (height follows the 5:7 card ratio). */
export const CARD_W_PCT = 6.4
/** Token diameter as a % of the stage width. */
export const TOKEN_W_PCT = 4.8

export interface Anchor {
  topPct: number
  leftPct: number
}

// ── Deck (face-down draw pile), just left of the market row ──────────────────
export const DECK_ANCHOR: Anchor = { topPct: 51, leftPct: 21 }

// ── Market: 5 face-up slots in a centred horizontal row ──────────────────────
const MARKET_TOP = 51
const MARKET_LEFT0 = 30.5
const MARKET_STEP = 7.1
export const MARKET_ANCHORS: Anchor[] = Array.from({ length: 5 }, (_, i) => ({
  topPct: MARKET_TOP,
  leftPct: MARKET_LEFT0 + i * MARKET_STEP,
}))

// ── Goods token piles: a column over the coloured supply bars on the right ───
export const GOODS_ANCHORS: Record<GoodsType, Anchor> = {
  diamonds: { topPct: 15.5, leftPct: 67 },
  gold:     { topPct: 24.5, leftPct: 67 },
  silver:   { topPct: 35, leftPct: 67 },
  cloth:    { topPct: 42.5, leftPct: 67 },
  spice:    { topPct: 51.5, leftPct: 67 },
  leather:  { topPct: 60.5, leftPct: 67 },
}

// ── Bonus tokens + the 5-rupee camel token, grouped near the centre-right ────
export const BONUS_ANCHORS: Record<BonusTier, Anchor> = {
  bonus3: { topPct: 74, leftPct: 63 },
  bonus4: { topPct: 74, leftPct: 68 },
  bonus5: { topPct: 74, leftPct: 73 },
}
export const CAMEL_ANCHOR: Anchor = { topPct: 74, leftPct: 78 }

/** Vertical peek (px) between each token when a supply pile is drawn as a 3D stack. */
export const TOKEN_STACK_OFFSET = 4

// ── Structural board zones (player areas, camel pens, seal slots) ─────────────
// These are purely positional references for future UI layers; nothing in the
// game engine reads them. Tune them with the visual editor (?edit=true).

/** Left-side face-down draw pile slot (sepia merchant illustration). */
export const DECK_DRAW_SLOT:    Anchor = { topPct: 51,   leftPct: 21   }
/** Face-up discard / sold-card accumulation area, below the draw pile. */
export const DECK_DISCARD_SLOT: Anchor = { topPct: 63,   leftPct: 21   }
/** Top-centre shaded rectangle — bot's camel herd, cards face-down. */
export const BOT_CAMEL_PEN:     Anchor = { topPct: 22,   leftPct: 44   }
/** Bottom-centre shaded rectangle — player's camel herd, cards face-up. */
export const PLAYER_CAMEL_PEN:  Anchor = { topPct: 80,   leftPct: 44   }
/** Top figure-8 twin-circle slot — bot's Seals of Excellence. */
export const BOT_SCORE_SEALS:   Anchor = { topPct: 13,   leftPct: 29   }
/** Bottom figure-8 twin-circle slot — player's Seals of Excellence. */
export const PLAYER_SCORE_SEALS: Anchor = { topPct: 87,  leftPct: 29   }

/** The six named structural zones on the printed board anatomy. */
export interface StructuralAnchors {
  deckDrawSlot:    Anchor
  deckDiscardSlot: Anchor
  botCamelPen:     Anchor
  playerCamelPen:  Anchor
  botScoreSeals:   Anchor
  playerScoreSeals: Anchor
}

export const STRUCTURAL_ANCHORS: StructuralAnchors = {
  deckDrawSlot:    DECK_DRAW_SLOT,
  deckDiscardSlot: DECK_DISCARD_SLOT,
  botCamelPen:     BOT_CAMEL_PEN,
  playerCamelPen:  PLAYER_CAMEL_PEN,
  botScoreSeals:   BOT_SCORE_SEALS,
  playerScoreSeals: PLAYER_SCORE_SEALS,
}

/**
 * A complete, mutable snapshot of every placement value on the board. The
 * Visual Layout Editor edits an instance of this (cloned from the constants
 * above) so the printed pieces can be dragged/nudged live, then exported back
 * into the constants. Nothing in the engine depends on it — pure presentation.
 */
export interface BoardLayout {
  cardWPct: number
  tokenWPct: number
  tokenStackOffset: number
  deck: Anchor
  market: Anchor[]
  goods: Record<GoodsType, Anchor>
  bonus: Record<BonusTier, Anchor>
  camel: Anchor
  /** Named anatomical zones used by future UI layers and the visual editor. */
  structural: StructuralAnchors
}

const cloneAnchor = (a: Anchor): Anchor => ({ topPct: a.topPct, leftPct: a.leftPct })
const cloneRecord = <K extends string>(r: Record<K, Anchor>): Record<K, Anchor> =>
  Object.fromEntries(
    (Object.entries(r) as [K, Anchor][]).map(([k, v]) => [k, cloneAnchor(v)]),
  ) as Record<K, Anchor>
const cloneStructural = (s: StructuralAnchors): StructuralAnchors => ({
  deckDrawSlot:    cloneAnchor(s.deckDrawSlot),
  deckDiscardSlot: cloneAnchor(s.deckDiscardSlot),
  botCamelPen:     cloneAnchor(s.botCamelPen),
  playerCamelPen:  cloneAnchor(s.playerCamelPen),
  botScoreSeals:   cloneAnchor(s.botScoreSeals),
  playerScoreSeals: cloneAnchor(s.playerScoreSeals),
})

/** Build a fresh, deeply-cloned editable layout from the module constants. */
export function createBoardLayout(): BoardLayout {
  return {
    cardWPct: CARD_W_PCT,
    tokenWPct: TOKEN_W_PCT,
    tokenStackOffset: TOKEN_STACK_OFFSET,
    deck: cloneAnchor(DECK_ANCHOR),
    market: MARKET_ANCHORS.map(cloneAnchor),
    goods: cloneRecord(GOODS_ANCHORS),
    bonus: cloneRecord(BONUS_ANCHORS),
    camel: cloneAnchor(CAMEL_ANCHOR),
    structural: cloneStructural(STRUCTURAL_ANCHORS),
  }
}

/**
 * Measures the board stage width so percentage-based zones can be converted to
 * pixel sizes for `JaipurCard` / `JaipurToken` (which take numeric sizes),
 * keeping pieces scaled with the responsive, aspect-locked container.
 */
export function useBoardSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  return { ref, width }
}

import type { GameState, Player } from '../../../core.js';

// ─────────────────────────────────────────────────────────────────────────────
// Jaipur — type definitions
//
// 2-player trading game. Players collect and sell goods to earn rupees (tokens).
// The richest merchant at the end of each round wins a Seal of Excellence; the
// first player to 2 seals wins the match (best of 3 rounds).
//
// Asset mapping reference (under packages/client/assets/jaipur/):
//   cartas/   → diamante, oro, plata, tela, especias, cuero, camello, reverso
//   fichas/   → goods value tokens (e.g. diamante7a), bonusNa, camello5a, sellos
//   board/    → mesa-base.png
// ─────────────────────────────────────────────────────────────────────────────

// ── Goods & card types ──────────────────────────────────────────────────────

/** High-value goods. Selling these requires a minimum of 2 cards per sale. */
export type LuxuryGood = 'diamonds' | 'gold' | 'silver';

/** Low-value goods. May be sold one card at a time. */
export type CommonGood = 'cloth' | 'spice' | 'leather';

/** Any sellable good (luxury or common). */
export type GoodsType = LuxuryGood | CommonGood;

/** Anything that can sit in the market or deck — goods plus camels. */
export type CardType = GoodsType | 'camel';

/**
 * A single physical card. `id` is unique and stable for the lifetime of a round
 * so React keys and animations stay anchored to the same DOM node.
 */
export interface JaipurCard {
  id: string;
  type: CardType;
}

// ── Tokens ───────────────────────────────────────────────────────────────────

/** Bonus token tiers, awarded by the number of cards sold in a single sale. */
export type BonusTier = 'bonus3' | 'bonus4' | 'bonus5';

/**
 * Token piles in Jaipur are non-homogeneous and deplete from the most valuable
 * downward, so each pile is modelled as an explicit list of values rather than a
 * count. Sellers always draw `goods[type][0]` first; sold-out piles are `[]`.
 */
export interface JaipurTokensState {
  /** Goods value tokens, each pile ordered high → low (draw from the front). */
  goods: Record<GoodsType, number[]>;
  /** Bonus token piles. Shuffled face-down at setup; exact value unknown until drawn. */
  bonus: Record<BonusTier, number[]>;
  /** Whether the 5-rupee camel token is still in play (awarded at round end). */
  camelTokenAvailable: boolean;
}

/**
 * A token a player has already collected. The discriminated `kind` records its
 * provenance for end-of-round scoring tie-breaks (most bonus tokens, etc.).
 */
export type JaipurEarnedToken =
  | { kind: 'goods'; good: GoodsType; value: number }
  | { kind: 'bonus'; tier: BonusTier; value: number }
  | { kind: 'camel'; value: number };

// ── Player state ──────────────────────────────────────────────────────────────

/**
 * Per-player round state. Extends the lobby {@link Player} so it remains
 * assignable to `GameState['players']` while carrying the full game payload.
 */
export interface JaipurPlayerState extends Player {
  /** Goods cards in hand. Max 7 at the end of a turn (camels do not count). */
  hand: JaipurCard[];
  /** Camels, kept visible in a separate area (the "manada"), never in hand. */
  corral: JaipurCard[];
  /** Tokens collected this round. */
  tokens: JaipurEarnedToken[];
  /** Sum of collected token values — the current round score (rupees). */
  score: number;
  /** Seals of Excellence won across the match (first to 2 wins). */
  sealsWon: number;
}

// ── Game state ─────────────────────────────────────────────────────────────────

/**
 * Full Jaipur game state. Extends the engine's {@link GameState}, overriding
 * `players` with the richer per-player payload and `board` with the table layout.
 */
export interface JaipurGameState extends GameState {
  /** Overridden with rich per-player state (still assignable to Player[]). */
  players: JaipurPlayerState[];
  /** Market row — always exactly 5 cards face up. */
  market: JaipurCard[];
  /** Draw pile (face down). */
  deck: JaipurCard[];
  /** Discard pile from completed sales. */
  discards: JaipurCard[];
  /** Remaining token piles and seals/camel-token availability. */
  tokens: JaipurTokensState;
  /** Current round number (1-based, best of 3). */
  round: number;
  /** Index into `players` of who starts the current round (loser of the last round). */
  roundStarterIndex: number;
  /** Player id that won each completed round, in order; null for an undecided round. */
  roundWinners: (string | null)[];
}

// ── Moves ──────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of the four legal Jaipur actions. A turn is exactly one of
 * these — you may never both take and sell in the same turn.
 */
export type JaipurMove =
  // Take exactly 1 goods card from the market into your hand.
  | { type: 'TAKE_SINGLE'; cardId: string }
  // Take ALL camels from the market into your corral.
  | { type: 'TAKE_CAMELS' }
  // Exchange ≥2 of your cards (hand goods and/or corral camels) for the same
  // number of goods cards from the market. The same goods type may not be both
  // given and taken.
  | { type: 'TRADE'; give: string[]; take: string[] }
  // Sell 1+ cards of a single goods type (luxury goods require ≥2 cards).
  | { type: 'SELL'; good: GoodsType; cardIds: string[] };

// ── Authoritative game data ─────────────────────────────────────────────────────

/** Maximum goods cards a player may hold at the end of a turn (camels excluded). */
export const JAIPUR_MAX_HAND = 7;

/** The market always holds exactly this many cards. */
export const JAIPUR_MARKET_SIZE = 5;

/** Camels placed face up in the market during setup. */
export const JAIPUR_STARTING_MARKET_CAMELS = 3;

/** Cards dealt to each player at setup. */
export const JAIPUR_STARTING_HAND = 5;

/** Value of the 5-rupee camel token (awarded to whoever has the most camels). */
export const JAIPUR_CAMEL_TOKEN_VALUE = 5;

/** Seals of Excellence required to win the match. */
export const JAIPUR_SEALS_TO_WIN = 2;

export const LUXURY_GOODS: readonly LuxuryGood[] = ['diamonds', 'gold', 'silver'];
export const COMMON_GOODS: readonly CommonGood[] = ['cloth', 'spice', 'leather'];
export const ALL_GOODS: readonly GoodsType[] = [...LUXURY_GOODS, ...COMMON_GOODS];

/** Minimum cards that must be sold together, per goods type. */
export const JAIPUR_MIN_SALE: Record<GoodsType, number> = {
  diamonds: 2,
  gold: 2,
  silver: 2,
  cloth: 1,
  spice: 1,
  leather: 1,
};

/** Number of each card type in the full 55-card goods deck (+ 11 camels). */
export const JAIPUR_DECK_COMPOSITION: Record<CardType, number> = {
  diamonds: 6,
  gold: 6,
  silver: 6,
  cloth: 8,
  spice: 8,
  leather: 10,
  camel: 11,
};

/**
 * Goods value tokens per type, ordered high → low (38 tokens total). Sellers draw
 * from the front of each pile.
 */
export const JAIPUR_GOODS_TOKEN_VALUES: Record<GoodsType, number[]> = {
  diamonds: [7, 7, 5, 5, 5],
  gold:     [6, 6, 5, 5, 5],
  silver:   [5, 5, 5, 5, 5],
  cloth:    [5, 3, 3, 2, 2, 1, 1],
  spice:    [5, 3, 3, 2, 2, 1, 1],
  leather:  [4, 3, 2, 1, 1, 1, 1, 1, 1],
};

/**
 * Bonus token values per tier (18 tokens total). Shuffled face-down at setup, so
 * the exact value drawn is hidden until earned.
 *   bonus3 → 3 cards sold, bonus4 → 4 cards, bonus5 → 5+ cards.
 */
export const JAIPUR_BONUS_TOKEN_VALUES: Record<BonusTier, number[]> = {
  bonus3: [1, 1, 2, 2, 3, 3],
  bonus4: [4, 4, 5, 5, 6, 6],
  bonus5: [8, 8, 9, 9, 10, 10],
};

/** Maps a card-sale count to the bonus tier earned (sales below 3 earn nothing). */
export function bonusTierForCount(count: number): BonusTier | null {
  if (count >= 5) return 'bonus5';
  if (count === 4) return 'bonus4';
  if (count === 3) return 'bonus3';
  return null;
}

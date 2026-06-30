import type { GameState, Player } from '../../../core.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — shared type definitions
//
// 2-4 player worker-placement game. Players send workers to resource gathering
// locations, build huts, and buy civilization cards.
//
// Asset mapping (under packages/client/assets/stoneage/):
//   huts/     → hut_1..hut_22 + variants (.png), hut_back.png
//   cards/    → 02.png, 03.gif..37.gif, cardback.png
//   meeples/  → red.png | blue.png | yellow.png | green.png
//   extras/   → board.jpg, player_board.jpg
// ─────────────────────────────────────────────────────────────────────────────

export type StoneAgeResourceType = 'WOOD' | 'CLAY' | 'STONE' | 'GOLD' | 'FOOD';

export type StoneAgePlayerColor = 'RED' | 'BLUE' | 'YELLOW' | 'GREEN';

export type StoneAgeGamePhase = 'PLACEMENT' | 'RESOLUTION' | 'FEEDING';

// ── Board locations ───────────────────────────────────────────────────────────

/**
 * Every distinct space on the main board where figures can be placed.
 *
 * Capacity rules (per rulebook):
 *   HUNTING_GROUNDS          — unlimited figures, any number of players
 *   FOREST / CLAY_MOUND /
 *   QUARRY / RIVER           — up to 7 figures total; exclusivity by player count
 *                              (4p: any players; 3p: max 2 players; 2p: max 1 player)
 *   TOOL_MAKER / FIELD       — exactly 1 figure; only 1 player per round
 *   HUT                      — exactly 2 figures of the SAME player, placed together
 *   CIV_CARD_0..3            — 1 figure each
 *   HUT_PILE_0..3            — 1 figure each (building tile spaces)
 */
export type StoneAgeBoardLocation =
  | 'HUNTING_GROUNDS'
  | 'FOREST'
  | 'CLAY_MOUND'
  | 'QUARRY'
  | 'RIVER'
  | 'TOOL_MAKER'
  | 'FIELD'
  | 'HUT'
  | 'CIV_CARD_0'
  | 'CIV_CARD_1'
  | 'CIV_CARD_2'
  | 'CIV_CARD_3'
  | 'HUT_PILE_0'
  | 'HUT_PILE_1'
  | 'HUT_PILE_2'
  | 'HUT_PILE_3';

/** Locations where the 2/3-player "only 2 of 3 may be occupied" rule applies. */
export const STONEAGE_LIMITED_LOCATIONS: readonly StoneAgeBoardLocation[] = [
  'TOOL_MAKER', 'HUT', 'FIELD',
] as const;

/** Resource-gathering locations subject to the per-player-count exclusivity rule. */
export const STONEAGE_RESOURCE_LOCATIONS: readonly StoneAgeBoardLocation[] = [
  'FOREST', 'CLAY_MOUND', 'QUARRY', 'RIVER',
] as const;

/** Max figures total across all players at each resource location. */
export const STONEAGE_RESOURCE_LOCATION_CAPACITY = 7;

// ── Placement state ───────────────────────────────────────────────────────────

/**
 * Which player (by playerIndex) occupies each location and with how many figures.
 * A location absent from the map means it is unoccupied.
 * Resource locations can hold figures from multiple players (except in 2/3p).
 */
export type StoneAgeBoardOccupancy = Partial<
  Record<StoneAgeBoardLocation, Array<{ playerIndex: number; count: number }>>
>;

// ── Moves ─────────────────────────────────────────────────────────────────────

export interface StoneAgePlaceFiguresPayload {
  type:     'PLACE_FIGURES';
  location: StoneAgeBoardLocation;
  /** Number of figures to place. Must be ≥ 1. HUT requires exactly 2. */
  count:    number;
}

export type StoneAgeMovePayload = StoneAgePlaceFiguresPayload;
// (future phases will add TAKE_ACTION, FEED_TRIBE, etc.)

// ── Component types ───────────────────────────────────────────────────────────

export interface StoneAgeMeepleState {
  total:     number;
  available: number;
  placed:    number;
}

export interface StoneAgeToolState {
  /** Tool token values, e.g. [2, 1, 1] = three tokens. */
  values:       number[];
  /** Parallel flag — true when that tool has been used this round. */
  usedThisTurn: boolean[];
}

export interface StoneAgeFixedCost {
  WOOD?:  number;
  CLAY?:  number;
  STONE?: number;
  GOLD?:  number;
}

export interface StoneAgeVariableCost {
  /** Total resources required, e.g. 4. */
  resourceCount: number;
  /** Max distinct resource types allowed, e.g. 1 = all same type. */
  allowedTypes:  number;
}

export interface StoneAgeHutTile {
  /** Matches the artwork file stem, e.g. 'hut_7', 'hut_7_b'. */
  id:        string;
  /** Exact filename with extension, e.g. 'hut_7_b.png'. */
  imageName: string;
  /** Fixed VP awarded when bought. */
  points:    number;
  cost: {
    fixed?:    StoneAgeFixedCost;
    variable?: StoneAgeVariableCost;
  };
  isRevealed: boolean;
}

export interface StoneAgeCivilizationCard {
  /** Card number as zero-padded string, e.g. '02', '37'. */
  id:               string;
  /** Exact filename, e.g. '02.png' or '03.gif'. */
  imageName:        string;
  /** TBD effect identifier — will be typed further when the engine implements cards. */
  immediateEffect:  string;
  endgameMultiplier?: {
    type:    'GREEN_BACKGROUND' | 'SAND_BACKGROUND';
    subType: string;
  };
}

export interface StoneAgePlayerState extends Player {
  color:       StoneAgePlayerColor;
  meeples:     StoneAgeMeepleState;
  resources:   Record<StoneAgeResourceType, number>;
  tools:       StoneAgeToolState;
  /** Current agriculture track position (0–10). */
  agriculture: number;
  score:       number;
}

/**
 * The full Stone Age game state. It IS the leaf board — stored in the outer
 * `GameState.board` field on the server (same pattern as Virus!/Jaipur).
 * `board: null` signals "I am the board" to the dispatcher.
 */
export interface StoneAgeGameState extends GameState {
  players:                StoneAgePlayerState[];
  currentTurn:            number;
  currentPhase:           StoneAgeGamePhase;
  /**
   * Index into `players` of whoever acts next (places figures or takes action).
   * During PLACEMENT this advances clockwise and wraps; during RESOLUTION it
   * follows the same clockwise order starting from the first player.
   */
  activePlayerIndex:      number;
  /**
   * Ordered list of player indices for this round's clockwise turn sequence.
   * Index 0 is the first player (holds the First Player token).
   */
  turnOrder:              number[];
  /**
   * Position within `turnOrder` of the player whose PLACEMENT sub-turn it is.
   * A player is skipped once their `meeples.available === 0`.
   */
  placementTurnIndex:     number;
  /** Which figures are on which board location, and whose they are. */
  boardOccupancy:         StoneAgeBoardOccupancy;
  hutPiles:               StoneAgeHutTile[][];
  civilizationCardsDeck:  StoneAgeCivilizationCard[];
  /** Exactly 4 slots; null means the slot is empty (card bought or not yet drawn). */
  activeCards:            (StoneAgeCivilizationCard | null)[];
  board:                  null;
}

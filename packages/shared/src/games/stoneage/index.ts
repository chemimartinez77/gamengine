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
  activePlayerIndex:      number;
  hutPiles:               StoneAgeHutTile[][];
  civilizationCardsDeck:  StoneAgeCivilizationCard[];
  /** Exactly 4 slots; null means the slot is empty (card bought or not yet drawn). */
  activeCards:            (StoneAgeCivilizationCard | null)[];
  board:                  null;
}

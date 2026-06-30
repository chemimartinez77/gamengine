// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — core game state types
//
// Type-safe foundation consumed by the initialization engine and the board UI.
// Asset-aware: `id`/`imageName` accommodate the processed file naming exactly
// (hut variants like `hut_7_b.png`, cards with mixed extensions like `03.gif`).
// Meeples & resources are modelled as numeric counts only — they render via
// CSS/Canvas primitives for now (no sprite typing required yet).
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceType = 'WOOD' | 'CLAY' | 'STONE' | 'GOLD' | 'FOOD';

export type PlayerColor = 'RED' | 'BLUE' | 'YELLOW' | 'GREEN';

export type GamePhase = 'PLACEMENT' | 'RESOLUTION' | 'FEEDING';

export interface MeepleState {
  total: number;
  available: number;
  placed: number;
}

export interface ToolState {
  values: number[];        // e.g., [2, 1, 1] representing three tools and their values
  usedThisTurn: boolean[]; // Tracks which tools have been tapped this round
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  meeples: MeepleState;
  resources: Record<ResourceType, number>;
  tools: ToolState;
  agriculture: number;     // Tracks food production level on the track
  score: number;
}

export interface FixedCost {
  // Hut costs can require specific counts of building materials
  WOOD?: number;
  CLAY?: number;
  STONE?: number;
  GOLD?: number;
}

export interface VariableCost {
  resourceCount: number;   // e.g., "requires exactly 4 resources"
  allowedTypes: number;    // e.g., "must be from 1 to 4 different types of resources"
}

export interface HutTile {
  id: string;              // Matches 'hut_7', 'hut_7_b', etc.
  imageName: string;       // Matches file exact name, e.g., 'hut_7.png', 'hut_7_b.png'
  points: number;          // Fixed points or calculated dynamically if variable cost
  cost: {
    fixed?: FixedCost;
    variable?: VariableCost;
  };
  isRevealed: boolean;
}

export interface CivilizationCard {
  id: string;              // Matches '02', '03' file naming convention
  imageName: string;       // Handles mixed extensions like '02.png', '03.gif'
  immediateEffect: string; // TBD string identifier for dice, direct resources, or temp tools
  endgameMultiplier?: {
    type: 'GREEN_BACKGROUND' | 'SAND_BACKGROUND';
    subType: string;       // Specific profession or cultural symbol for end-game scoring
  };
}

export interface GameState {
  players: PlayerState[];
  currentTurn: number;
  currentPhase: GamePhase;
  activePlayerIndex: number;
  hutPiles: HutTile[][];   // The 4 distinct hut stacks available on the board
  civilizationCardsDeck: CivilizationCard[];
  activeCards: (CivilizationCard | null)[]; // The 4 face-up cards available in the market track
}

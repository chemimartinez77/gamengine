import type {
  StoneAgeGameState, StoneAgePlayerState, StoneAgeHutTile,
  StoneAgeCivilizationCard, StoneAgePlayerColor,
} from '@gamengine/shared';
import type { Player } from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — server-side initialization
//
// Builds the initial StoneAgeGameState from a list of lobby Player objects.
// Player colors are assigned by index (YELLOW, RED, BLUE, GREEN) since the
// lobby doesn't yet have a color-picker.
//
// Asset names mirror the processed files under packages/client/assets/stoneage/:
//   huts/  → 28 tile files (hut_1..hut_22 + variants), excluding hut_back.png.
//   cards/ → 36 cards: 02.png + 03.gif..37.gif, excluding cardback.png.
//
// Hut costs/points are plausible mocks for now; the full cost table will be
// filled in when the move engine is implemented.
// ─────────────────────────────────────────────────────────────────────────────

const HUT_PILE_COUNT   = 4;
const ACTIVE_CARD_SLOTS = 4;
const STARTING_MEEPLES  = 5;
const STARTING_FOOD     = 12;

/** Colors assigned to players by seat index (0-based). */
const PLAYER_COLORS: readonly StoneAgePlayerColor[] = ['YELLOW', 'RED', 'BLUE', 'GREEN'];

/**
 * Exact hut tile file stems (no extension) — 28 tiles including artwork variants.
 * `hut_back.png` (the shared back sprite) is intentionally excluded.
 */
const HUT_IDS: readonly string[] = [
  'hut_1', 'hut_2', 'hut_3', 'hut_4', 'hut_5', 'hut_6',
  'hut_7', 'hut_7_b', 'hut_7_c',
  'hut_8', 'hut_9', 'hut_9_b',
  'hut_10', 'hut_11', 'hut_12', 'hut_13',
  'hut_14', 'hut_14_b',
  'hut_15', 'hut_16', 'hut_17', 'hut_18', 'hut_19', 'hut_20',
  'hut_21', 'hut_21_b',
  'hut_22', 'hut_22_b',
];

const CARD_FIRST = 2;
const CARD_LAST  = 37;

function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function buildHutTile(id: string, index: number): StoneAgeHutTile {
  const isVariable = index % 4 === 3;
  return {
    id,
    imageName: `${id}.png`,
    points:    isVariable ? 14 : 10,
    cost:      isVariable
      ? { variable: { resourceCount: 4, allowedTypes: 2 } }
      : { fixed: { WOOD: 1, CLAY: 1, STONE: 1 } },
    isRevealed: false,
  };
}

function buildCard(n: number): StoneAgeCivilizationCard {
  const id  = String(n).padStart(2, '0');
  const ext = n === CARD_FIRST ? 'png' : 'gif';
  return { id, imageName: `${id}.${ext}`, immediateEffect: 'TBD' };
}

function buildPlayer(lobbyPlayer: Player, colorIndex: number): StoneAgePlayerState {
  return {
    id:          lobbyPlayer.id,
    name:        lobbyPlayer.name,
    isBot:       lobbyPlayer.isBot,
    color:       PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!,
    meeples:     { total: STARTING_MEEPLES, available: STARTING_MEEPLES, placed: 0 },
    resources:   { WOOD: 0, CLAY: 0, STONE: 0, GOLD: 0, FOOD: STARTING_FOOD },
    tools:       { values: [], usedThisTurn: [] },
    agriculture: 0,
    score:       0,
  };
}

export function initStoneAgeGame(players: Player[]): StoneAgeGameState {
  const playerStates = players.map((p, i) => buildPlayer(p, i));

  // ── Hut tiles → shuffle → 4 round-robin piles; reveal pile tops ────────────
  const allHuts     = HUT_IDS.map(buildHutTile);
  const shuffled    = shuffle(allHuts);
  const hutPiles: StoneAgeHutTile[][] = Array.from({ length: HUT_PILE_COUNT }, () => []);
  shuffled.forEach((tile, i) => { hutPiles[i % HUT_PILE_COUNT]!.push(tile); });
  for (const pile of hutPiles) {
    if (pile.length > 0) pile[0]!.isRevealed = true;
  }

  // ── Civilization cards → shuffle → draw 4 to the market track ──────────────
  const allCards: StoneAgeCivilizationCard[] = [];
  for (let n = CARD_FIRST; n <= CARD_LAST; n++) allCards.push(buildCard(n));
  const deck        = shuffle(allCards);
  const activeCards = deck.slice(0, ACTIVE_CARD_SLOTS) as (StoneAgeCivilizationCard | null)[];
  const remaining   = deck.slice(ACTIVE_CARD_SLOTS);

  // Turn order: 0, 1, 2, … (seat index = clockwise order for round 1).
  // The first player (index 0) holds the First Player token initially.
  const turnOrder = playerStates.map((_, i) => i);

  return {
    players:               playerStates,
    turn:                  0,
    board:                 null,
    winner:                null,
    currentTurn:           1,
    currentPhase:          'PLACEMENT',
    activePlayerIndex:     0,
    turnOrder,
    placementTurnIndex:    0,
    boardOccupancy:        {},
    hutPiles,
    civilizationCardsDeck: remaining,
    activeCards,
  };
}

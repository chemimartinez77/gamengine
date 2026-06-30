import type {
  StoneAgeGameState, StoneAgePlayerState, StoneAgeHutTile,
  StoneAgeCivilizationCard, StoneAgePlayerColor,
} from '@gamengine/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — client-side game initialization (sandbox use only).
//
// Used exclusively by StoneAgeSandbox to seed a fake game without a server.
// Live gameplay uses the server's init (packages/server/src/games/stoneage/init.ts).
//
// Asset names map 1:1 to the processed files under packages/client/assets/stoneage/:
//   • huts/  → 28 tile files (hut_1..hut_22 + variants), excluding hut_back.png.
//   • cards/ → 36 cards: 02.png + 03.gif..37.gif, excluding cardback.png.
// ─────────────────────────────────────────────────────────────────────────────

const HUT_PILE_COUNT   = 4
const ACTIVE_CARD_SLOTS = 4
const STARTING_MEEPLES  = 5
const STARTING_FOOD     = 12

const HUT_IDS: readonly string[] = [
  'hut_1', 'hut_2', 'hut_3', 'hut_4', 'hut_5', 'hut_6',
  'hut_7', 'hut_7_b', 'hut_7_c',
  'hut_8', 'hut_9', 'hut_9_b',
  'hut_10', 'hut_11', 'hut_12', 'hut_13',
  'hut_14', 'hut_14_b',
  'hut_15', 'hut_16', 'hut_17', 'hut_18', 'hut_19', 'hut_20',
  'hut_21', 'hut_21_b',
  'hut_22', 'hut_22_b',
]

const CARD_FIRST = 2
const CARD_LAST  = 37

function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function buildHutTile(id: string, index: number): StoneAgeHutTile {
  const isVariable = index % 4 === 3
  return {
    id,
    imageName: `${id}.png`,
    points: isVariable ? 14 : 10,
    cost: isVariable
      ? { variable: { resourceCount: 4, allowedTypes: 2 } }
      : { fixed: { WOOD: 1, CLAY: 1, STONE: 1 } },
    isRevealed: false,
  }
}

function buildCivilizationCard(n: number): StoneAgeCivilizationCard {
  const id  = String(n).padStart(2, '0')
  const ext = n === CARD_FIRST ? 'png' : 'gif'
  return { id, imageName: `${id}.${ext}`, immediateEffect: 'TBD' }
}

function buildPlayer(seed: { id: string; name: string; color: StoneAgePlayerColor }): StoneAgePlayerState {
  return {
    id:          seed.id,
    name:        seed.name,
    color:       seed.color,
    meeples:     { total: STARTING_MEEPLES, available: STARTING_MEEPLES, placed: 0 },
    resources:   { WOOD: 0, CLAY: 0, STONE: 0, GOLD: 0, FOOD: STARTING_FOOD },
    tools:       { values: [], usedThisTurn: [] },
    agriculture: 0,
    score:       0,
  }
}

export function initStoneAgeGame(
  players: { id: string; name: string; color: StoneAgePlayerColor }[],
): StoneAgeGameState {
  const playerStates: StoneAgePlayerState[] = players.map(buildPlayer)

  const allHuts      = HUT_IDS.map(buildHutTile)
  const shuffledHuts = shuffle(allHuts)
  const hutPiles: StoneAgeHutTile[][] = Array.from({ length: HUT_PILE_COUNT }, () => [])
  shuffledHuts.forEach((tile, i) => { hutPiles[i % HUT_PILE_COUNT]!.push(tile) })
  for (const pile of hutPiles) {
    if (pile.length > 0) pile[0]!.isRevealed = true
  }

  const allCards: StoneAgeCivilizationCard[] = []
  for (let n = CARD_FIRST; n <= CARD_LAST; n++) allCards.push(buildCivilizationCard(n))
  const shuffledDeck = shuffle(allCards)
  const activeCards  = shuffledDeck.slice(0, ACTIVE_CARD_SLOTS) as (StoneAgeCivilizationCard | null)[]
  const remaining    = shuffledDeck.slice(ACTIVE_CARD_SLOTS)

  return {
    players:               playerStates,
    turn:                  0,
    board:                 null,
    winner:                null,
    currentTurn:           1,
    currentPhase:          'PLACEMENT',
    activePlayerIndex:     0,
    hutPiles,
    civilizationCardsDeck: remaining,
    activeCards,
  }
}

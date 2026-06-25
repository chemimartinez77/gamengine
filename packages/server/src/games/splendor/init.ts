import {
  LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS,
  type GemType, type TokenType,
  type SplendorPlayer, type SplendorGameState,
} from '@gamengine/shared'

const ALL_GEM_TYPES: GemType[]   = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx']
const ALL_TOKEN_TYPES: TokenType[] = [...ALL_GEM_TYPES, 'gold']
const NOBLE_POOL = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function emptyTokens(): Record<TokenType, number> {
  return Object.fromEntries(ALL_TOKEN_TYPES.map(t => [t, 0])) as Record<TokenType, number>
}

function emptyGems(): Record<GemType, number> {
  return Object.fromEntries(ALL_GEM_TYPES.map(g => [g, 0])) as Record<GemType, number>
}

export function initializeSplendorGame(
  connectedPlayers: { id: string; name: string }[],
): SplendorGameState {
  const n = connectedPlayers.length
  const gemCount = n === 2 ? 4 : n === 3 ? 5 : 7

  const players: SplendorPlayer[] = connectedPlayers.map(p => ({
    id:               p.id,
    name:             p.name,
    tokens:           emptyTokens(),
    bonusGems:        emptyGems(),
    developmentCards: [],
    reservedCards:    [],
    nobles:           [],
    prestigePoints:   0,
  }))

  const bankTokens = emptyTokens()
  for (const gem of ALL_GEM_TYPES) bankTokens[gem] = gemCount
  bankTokens.gold = 5

  const availableNobles = shuffle(NOBLE_POOL).slice(0, n + 1)

  const shuffled1 = shuffle(LEVEL1_CARDS.map(c => c.id))
  const shuffled2 = shuffle(LEVEL2_CARDS.map(c => c.id))
  const shuffled3 = shuffle(LEVEL3_CARDS.map(c => c.id))

  const market: Record<1 | 2 | 3, string[]> = {
    1: shuffled1.splice(0, 4),
    2: shuffled2.splice(0, 4),
    3: shuffled3.splice(0, 4),
  }

  return {
    gameId:         crypto.randomUUID(),
    status:         'PLAYING',
    players,
    activePlayerId: players[0].id,
    bankTokens,
    availableNobles,
    decks:          { 1: shuffled1, 2: shuffled2, 3: shuffled3 },
    market,
    winnerId:       null,
  }
}

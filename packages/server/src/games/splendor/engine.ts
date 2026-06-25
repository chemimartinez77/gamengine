import {
  LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES,
  type GemType, type TokenType,
  type SplendorCard, type SplendorPlayer, type SplendorGameState, type SplendorAction,
} from '@gamengine/shared'

// ── Lookup tables built once at module load ───────────────────────────────────

const ALL_GEMS: GemType[]    = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx']
const ALL_TOKENS: TokenType[] = [...ALL_GEMS, 'gold']

const CARD_BY_ID = new Map<string, SplendorCard>(
  [...LEVEL1_CARDS, ...LEVEL2_CARDS, ...LEVEL3_CARDS].map(c => [c.id, c])
)

// ── Deep-copy helpers ─────────────────────────────────────────────────────────

function copyTokens(t: Record<TokenType, number>): Record<TokenType, number> {
  return { ...t }
}

function copyGems(g: Record<GemType, number>): Record<GemType, number> {
  return { ...g }
}

function copyPlayer(p: SplendorPlayer): SplendorPlayer {
  return {
    ...p,
    tokens:           copyTokens(p.tokens),
    bonusGems:        copyGems(p.bonusGems),
    developmentCards: [...p.developmentCards],
    reservedCards:    [...p.reservedCards],
    nobles:           [...p.nobles],
  }
}

function copyState(s: SplendorGameState): SplendorGameState {
  return {
    ...s,
    players:         s.players.map(copyPlayer),
    bankTokens:      copyTokens(s.bankTokens),
    availableNobles: [...s.availableNobles],
    decks:           { 1: [...s.decks[1]], 2: [...s.decks[2]], 3: [...s.decks[3]] },
    market:          { 1: [...s.market[1]], 2: [...s.market[2]], 3: [...s.market[3]] },
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function totalTokens(p: SplendorPlayer): number {
  return ALL_TOKENS.reduce((sum, t) => sum + p.tokens[t], 0)
}

function requiresDiscard(p: SplendorPlayer): boolean {
  return totalTokens(p) > 10
}

function findCardLevel(cardId: string, state: SplendorGameState): 1 | 2 | 3 | null {
  for (const lvl of [1, 2, 3] as const) {
    if (state.market[lvl].includes(cardId)) return lvl
  }
  return null
}

// Refill market slot at `level` from the deck (mutates the passed copies).
function refillMarket(
  market: Record<1 | 2 | 3, string[]>,
  decks:  Record<1 | 2 | 3, string[]>,
  level:  1 | 2 | 3,
): void {
  if (decks[level].length > 0) {
    market[level].push(decks[level].shift()!)
  }
}

// ── Noble visit (max 1 per turn, first qualifying noble wins) ─────────────────

function applyNobleVisit(player: SplendorPlayer, state: SplendorGameState): void {
  for (const nobleId of state.availableNobles) {
    const noble = NOBLES.find(n => n.id === nobleId)
    if (!noble) continue
    const qualifies = (Object.entries(noble.requires) as [GemType, number][])
      .every(([gem, req]) => (player.bonusGems[gem] ?? 0) >= req)
    if (qualifies) {
      state.availableNobles = state.availableNobles.filter(id => id !== nobleId)
      player.nobles.push(nobleId)
      player.prestigePoints += noble.prestigePoints
      break
    }
  }
}

// ── Victory check (called after full round completion) ───────────────────────

function resolveVictory(state: SplendorGameState): void {
  const triggered = state.players.some(p => p.prestigePoints >= 15)
  if (!triggered) return

  const firstPlayerId = state.players[0].id
  if (state.activePlayerId !== firstPlayerId) return // not yet end of round

  let winner = state.players[0]
  for (const p of state.players.slice(1)) {
    if (
      p.prestigePoints > winner.prestigePoints ||
      (p.prestigePoints === winner.prestigePoints &&
       p.developmentCards.length < winner.developmentCards.length)
    ) {
      winner = p
    }
  }
  state.status   = 'FINISHED'
  state.winnerId = winner.id
}

// ── Post-action pipeline ──────────────────────────────────────────────────────

function postAction(state: SplendorGameState, playerIdx: number): SplendorGameState {
  const player = state.players[playerIdx]

  // If player is over the token limit, keep turn on them — discard required.
  if (requiresDiscard(player)) return state

  applyNobleVisit(player, state)

  // Advance turn
  const nextIdx = (playerIdx + 1) % state.players.length
  state.activePlayerId = state.players[nextIdx].id

  resolveVictory(state)

  return state
}

// ── BUY_CARD cost calculator ──────────────────────────────────────────────────

function computeCost(
  card:   SplendorCard,
  player: SplendorPlayer,
): { spend: Record<TokenType, number>; goldNeeded: number } | null {
  const spend: Record<TokenType, number> = Object.fromEntries(
    ALL_TOKENS.map(t => [t, 0])
  ) as Record<TokenType, number>

  let goldNeeded = 0

  for (const gem of ALL_GEMS) {
    const raw     = card.cost[gem] ?? 0
    const bonus   = player.bonusGems[gem] ?? 0
    const net     = Math.max(0, raw - bonus)
    const fromGem = Math.min(net, player.tokens[gem])
    const deficit = net - fromGem
    spend[gem]   += fromGem
    goldNeeded   += deficit
  }

  if (goldNeeded > player.tokens.gold) return null // insufficient funds
  spend.gold = goldNeeded
  return { spend, goldNeeded }
}

// ── Main exported reducer ─────────────────────────────────────────────────────

export function handleSplendorAction(
  state:    SplendorGameState,
  action:   SplendorAction,
  playerId: string,
): SplendorGameState {
  if (state.status !== 'PLAYING') throw new Error('GAME_NOT_PLAYING')
  if (state.activePlayerId !== playerId) throw new Error('NOT_YOUR_TURN')

  const s         = copyState(state)
  const playerIdx = s.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1) throw new Error('PLAYER_NOT_FOUND')
  const player = s.players[playerIdx]

  // If player is over limit, only DISCARD_TOKENS is allowed.
  if (requiresDiscard(player) && action.type !== 'DISCARD_TOKENS') {
    throw new Error('MUST_DISCARD_TOKENS')
  }

  switch (action.type) {

    case 'TAKE_THREE_DIFFERENT_TOKENS': {
      const { gems } = action
      if (gems.length !== 3 || new Set(gems).size !== 3)
        throw new Error('INVALID_GEMS_SELECTION')
      for (const gem of gems) {
        if ((s.bankTokens[gem] ?? 0) < 1) throw new Error(`INSUFFICIENT_${gem.toUpperCase()}`)
      }
      for (const gem of gems) {
        s.bankTokens[gem]--
        player.tokens[gem]++
      }
      break
    }

    case 'TAKE_TWO_SAME_TOKENS': {
      const { gem } = action
      if ((s.bankTokens[gem] ?? 0) < 4) throw new Error('INSUFFICIENT_TOKENS_FOR_DOUBLE')
      s.bankTokens[gem] -= 2
      player.tokens[gem] += 2
      break
    }

    case 'RESERVE_CARD': {
      const { cardId } = action
      if (player.reservedCards.length >= 3) throw new Error('RESERVE_LIMIT_REACHED')
      const level = findCardLevel(cardId, s)
      if (level === null) throw new Error('CARD_NOT_IN_MARKET')
      s.market[level] = s.market[level].filter(id => id !== cardId)
      player.reservedCards.push(cardId)
      if (s.bankTokens.gold > 0) {
        s.bankTokens.gold--
        player.tokens.gold++
      }
      refillMarket(s.market, s.decks, level)
      break
    }

    case 'BUY_CARD': {
      const { cardId } = action
      const card = CARD_BY_ID.get(cardId)
      if (!card) throw new Error('UNKNOWN_CARD')

      const inMarket   = findCardLevel(cardId, s) !== null
      const inReserved = player.reservedCards.includes(cardId)
      if (!inMarket && !inReserved) throw new Error('CARD_NOT_AVAILABLE')

      const costResult = computeCost(card, player)
      if (!costResult) throw new Error('INSUFFICIENT_FUNDS')
      const { spend } = costResult

      // Deduct tokens from player and return to bank
      for (const t of ALL_TOKENS) {
        player.tokens[t]    -= spend[t]
        s.bankTokens[t]     += spend[t]
      }

      // Move card
      if (inMarket) {
        const level = findCardLevel(cardId, s)!
        s.market[level] = s.market[level].filter(id => id !== cardId)
        refillMarket(s.market, s.decks, level)
      } else {
        player.reservedCards = player.reservedCards.filter(id => id !== cardId)
      }

      player.developmentCards.push(cardId)
      player.bonusGems[card.gemProduced]++
      player.prestigePoints += card.prestigePoints
      break
    }

    case 'DISCARD_TOKENS': {
      const { gems } = action
      const current = totalTokens(player)
      if (current <= 10) throw new Error('NO_DISCARD_NEEDED')
      if (gems.length !== current - 10) throw new Error('WRONG_DISCARD_COUNT')

      // Validate player holds each token being discarded
      const tally: Partial<Record<TokenType, number>> = {}
      for (const t of gems) tally[t] = (tally[t] ?? 0) + 1
      for (const [t, n] of Object.entries(tally) as [TokenType, number][]) {
        if ((player.tokens[t] ?? 0) < n) throw new Error(`INSUFFICIENT_${t.toUpperCase()}_TO_DISCARD`)
      }

      for (const t of gems) {
        player.tokens[t]--
        s.bankTokens[t]++
      }

      // After discard the pipeline continues: noble check + turn advance
      return postAction(s, playerIdx)
    }

    default:
      throw new Error('UNKNOWN_ACTION')
  }

  return postAction(s, playerIdx)
}

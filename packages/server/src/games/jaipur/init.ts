import {
  type JaipurGameState, type JaipurPlayerState, type JaipurCard,
  type CardType, type GoodsType, type JaipurTokensState,
  ALL_GOODS,
  JAIPUR_DECK_COMPOSITION,
  JAIPUR_GOODS_TOKEN_VALUES,
  JAIPUR_BONUS_TOKEN_VALUES,
  JAIPUR_STARTING_MARKET_CAMELS,
  JAIPUR_STARTING_HAND,
  JAIPUR_MARKET_SIZE,
} from '@gamengine/shared';

// Fisher–Yates shuffle (non-mutating).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a pristine Jaipur round following the official setup sequence.
 *
 * `name` is seeded from the id; the GameEngine adapter (and round-reset logic)
 * patch in the real display names, since this function only receives ids.
 */
export function initJaipurGame(
  playerIds: string[],
  roundStarterIndex = 0,
): JaipurGameState {
  // Unique, stable card ids for the lifetime of this round.
  let seq = 0;
  const makeCard = (type: CardType): JaipurCard => ({ id: `${type}-${seq++}`, type });

  // ── Full 55-card deck ──────────────────────────────────────────────────────
  const fullDeck: JaipurCard[] = [];
  for (const [type, count] of Object.entries(JAIPUR_DECK_COMPOSITION) as [CardType, number][]) {
    for (let i = 0; i < count; i++) fullDeck.push(makeCard(type));
  }

  // ── 3 camels go straight into the market ────────────────────────────────────
  const market: JaipurCard[] = [];
  for (let i = 0; i < JAIPUR_STARTING_MARKET_CAMELS; i++) {
    const camelIdx = fullDeck.findIndex(c => c.type === 'camel');
    market.push(fullDeck.splice(camelIdx, 1)[0]);
  }

  // ── Shuffle the remaining 52 cards into the draw pile ───────────────────────
  const deck = shuffle(fullDeck);

  // ── Deal 5 cards to each player (round-robin) ───────────────────────────────
  const players: JaipurPlayerState[] = playerIds.map(id => ({
    id,
    name:   id,
    hand:   [],
    corral: [],
    tokens: [],
    score:  0,
    sealsWon: 0,
  }));
  for (let r = 0; r < JAIPUR_STARTING_HAND; r++) {
    for (const p of players) p.hand.push(deck.shift()!);
  }

  // ── Camels dealt into a hand move immediately to that player's corral ───────
  for (const p of players) {
    p.corral.push(...p.hand.filter(c => c.type === 'camel'));
    p.hand = p.hand.filter(c => c.type !== 'camel');
  }

  // ── Complete the market to 5 cards from the deck ────────────────────────────
  while (market.length < JAIPUR_MARKET_SIZE && deck.length > 0) {
    market.push(deck.shift()!);
  }

  // ── Tokens: goods piles ordered high→low, bonus piles shuffled (drawn blind) ─
  const goods = {} as Record<GoodsType, number[]>;
  for (const g of ALL_GOODS) goods[g] = [...JAIPUR_GOODS_TOKEN_VALUES[g]];

  const tokens: JaipurTokensState = {
    goods,
    bonus: {
      bonus3: shuffle(JAIPUR_BONUS_TOKEN_VALUES.bonus3),
      bonus4: shuffle(JAIPUR_BONUS_TOKEN_VALUES.bonus4),
      bonus5: shuffle(JAIPUR_BONUS_TOKEN_VALUES.bonus5),
    },
    camelTokenAvailable: true,
  };

  return {
    players,
    turn:    roundStarterIndex,
    board:   null,
    winner:  null,
    market,
    deck,
    discards: [],
    tokens,
    round: 1,
    roundStarterIndex,
    roundWinners: [],
  };
}

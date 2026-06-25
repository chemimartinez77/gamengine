import {
  type JaipurGameState, type JaipurPlayerState, type JaipurCard,
  type GoodsType, type JaipurMove, type JaipurTokensState,
  ALL_GOODS,
  JAIPUR_MAX_HAND,
  JAIPUR_MARKET_SIZE,
  JAIPUR_MIN_SALE,
  JAIPUR_CAMEL_TOKEN_VALUE,
  JAIPUR_SEALS_TO_WIN,
  bonusTierForCount,
} from '@gamengine/shared';
import { GameError } from '@gamengine/shared';
import { initJaipurGame } from './init.js';

// ── Deep-copy helpers ──────────────────────────────────────────────────────────

function copyCard(c: JaipurCard): JaipurCard {
  return { id: c.id, type: c.type };
}

function copyPlayer(p: JaipurPlayerState): JaipurPlayerState {
  return {
    ...p,
    hand:   p.hand.map(copyCard),
    corral: p.corral.map(copyCard),
    tokens: p.tokens.map(t => ({ ...t })),
  };
}

function copyTokens(t: JaipurTokensState): JaipurTokensState {
  const goods = {} as Record<GoodsType, number[]>;
  for (const g of ALL_GOODS) goods[g] = [...t.goods[g]];
  return {
    goods,
    bonus: {
      bonus3: [...t.bonus.bonus3],
      bonus4: [...t.bonus.bonus4],
      bonus5: [...t.bonus.bonus5],
    },
    camelTokenAvailable: t.camelTokenAvailable,
  };
}

function copyState(s: JaipurGameState): JaipurGameState {
  return {
    ...s,
    players:      s.players.map(copyPlayer),
    market:       s.market.map(copyCard),
    deck:         s.deck.map(copyCard),
    discards:     s.discards.map(copyCard),
    tokens:       copyTokens(s.tokens),
    roundWinners: [...s.roundWinners],
  };
}

// ── Shared utilities ─────────────────────────────────────────────────────────

// Refill the market back up to 5 cards, as far as the deck allows.
function refillMarket(s: JaipurGameState): void {
  while (s.market.length < JAIPUR_MARKET_SIZE && s.deck.length > 0) {
    s.market.push(s.deck.shift()!);
  }
}

function emptyGoodsPileCount(s: JaipurGameState): number {
  return ALL_GOODS.filter(g => s.tokens.goods[g].length === 0).length;
}

// Round ends when the deck can no longer refill the market, or 3 goods piles empty.
function isRoundEndTriggered(s: JaipurGameState): boolean {
  return s.market.length < JAIPUR_MARKET_SIZE || emptyGoodsPileCount(s) >= 3;
}

function recomputeScore(p: JaipurPlayerState): void {
  p.score = p.tokens.reduce((sum, t) => sum + t.value, 0);
}

// ── Action handlers (mutate the working copy `s`) ──────────────────────────────

function handleTakeSingle(
  s: JaipurGameState,
  player: JaipurPlayerState,
  move: Extract<JaipurMove, { type: 'TAKE_SINGLE' }>,
): void {
  const card = s.market.find(c => c.id === move.cardId);
  if (!card) throw new GameError('CARD_NOT_IN_MARKET');
  if (card.type === 'camel') throw new GameError('USE_TAKE_CAMELS_FOR_CAMELS');
  if (player.hand.length + 1 > JAIPUR_MAX_HAND) throw new GameError('HAND_LIMIT_EXCEEDED');

  s.market = s.market.filter(c => c.id !== card.id);
  player.hand.push(card);
  refillMarket(s);
}

function handleTakeCamels(s: JaipurGameState, player: JaipurPlayerState): void {
  const camels = s.market.filter(c => c.type === 'camel');
  if (camels.length === 0) throw new GameError('NO_CAMELS_IN_MARKET');

  s.market = s.market.filter(c => c.type !== 'camel');
  player.corral.push(...camels);
  refillMarket(s);
}

function handleTrade(
  s: JaipurGameState,
  player: JaipurPlayerState,
  move: Extract<JaipurMove, { type: 'TRADE' }>,
): void {
  const { give, take } = move;

  if (give.length !== take.length) throw new GameError('TRADE_COUNT_MISMATCH');
  if (give.length < 2) throw new GameError('TRADE_MIN_TWO_CARDS');
  if (new Set(give).size !== give.length) throw new GameError('DUPLICATE_GIVE_CARD');
  if (new Set(take).size !== take.length) throw new GameError('DUPLICATE_TAKE_CARD');

  // Resolve the market cards being taken (goods only — camels need TAKE_CAMELS).
  const takeCards = take.map(id => {
    const c = s.market.find(m => m.id === id);
    if (!c) throw new GameError('CARD_NOT_IN_MARKET');
    return c;
  });
  if (takeCards.some(c => c.type === 'camel')) throw new GameError('CANNOT_TRADE_FOR_CAMEL');

  // Resolve the cards the player gives up — from hand (goods) or corral (camels).
  const giveCards = give.map(id => {
    const c = player.hand.find(h => h.id === id) ?? player.corral.find(h => h.id === id);
    if (!c) throw new GameError('CARD_NOT_OWNED');
    return c;
  });

  // Cannot give back a goods type you are simultaneously taking.
  const takenTypes = new Set<GoodsType>(takeCards.map(c => c.type as GoodsType));
  for (const c of giveCards) {
    if (c.type !== 'camel' && takenTypes.has(c.type)) {
      throw new GameError('CANNOT_TRADE_SAME_GOODS_TYPE');
    }
  }

  // Hand-size guard: only hand cards given reduce the hand; all taken cards are goods.
  const fromHandCount = giveCards.filter(c => player.hand.some(h => h.id === c.id)).length;
  const newHandSize = player.hand.length - fromHandCount + takeCards.length;
  if (newHandSize > JAIPUR_MAX_HAND) throw new GameError('HAND_LIMIT_EXCEEDED');

  // Execute the exchange. Market stays at 5 (given cards refill the taken slots).
  const giveIds = new Set(give);
  const takeIds = new Set(take);
  player.hand   = player.hand.filter(c => !giveIds.has(c.id));
  player.corral = player.corral.filter(c => !giveIds.has(c.id));
  s.market      = s.market.filter(c => !takeIds.has(c.id));
  player.hand.push(...takeCards);
  s.market.push(...giveCards);
}

function handleSell(
  s: JaipurGameState,
  player: JaipurPlayerState,
  move: Extract<JaipurMove, { type: 'SELL' }>,
): void {
  const { good, cardIds } = move;

  if (cardIds.length === 0) throw new GameError('NOTHING_TO_SELL');
  if (new Set(cardIds).size !== cardIds.length) throw new GameError('DUPLICATE_SELL_CARD');

  const cards = cardIds.map(id => {
    const c = player.hand.find(h => h.id === id);
    if (!c) throw new GameError('CARD_NOT_IN_HAND');
    return c;
  });
  if (cards.some(c => c.type !== good)) throw new GameError('MIXED_GOODS_SALE');

  // Luxury goods (diamonds/gold/silver) require ≥2 cards per sale.
  if (cards.length < JAIPUR_MIN_SALE[good]) throw new GameError('MINIMUM_SALE_NOT_MET');

  const n = cards.length;

  // Move sold cards to the discard pile.
  const sellIds = new Set(cardIds);
  player.hand = player.hand.filter(c => !sellIds.has(c.id));
  s.discards.push(...cards);

  // Award one goods token per card, highest value first (or as many as remain).
  const pile = s.tokens.goods[good];
  for (let i = 0; i < n && pile.length > 0; i++) {
    player.tokens.push({ kind: 'goods', good, value: pile.shift()! });
  }

  // Selling 3+ cards earns a bonus token (piles are pre-shuffled → drawn blind).
  const tier = bonusTierForCount(n);
  if (tier) {
    const bonusPile = s.tokens.bonus[tier];
    if (bonusPile.length > 0) {
      player.tokens.push({ kind: 'bonus', tier, value: bonusPile.shift()! });
    }
  }

  recomputeScore(player);
}

// ── End-of-round resolution ────────────────────────────────────────────────────

function determineRoundWinner(players: JaipurPlayerState[]): JaipurPlayerState | null {
  const [a, b] = players;
  if (a.score !== b.score) return a.score > b.score ? a : b;

  // Tie-break 1: most bonus tokens.
  const aBonus = a.tokens.filter(t => t.kind === 'bonus').length;
  const bBonus = b.tokens.filter(t => t.kind === 'bonus').length;
  if (aBonus !== bBonus) return aBonus > bBonus ? a : b;

  // Tie-break 2: most goods tokens.
  const aGoods = a.tokens.filter(t => t.kind === 'goods').length;
  const bGoods = b.tokens.filter(t => t.kind === 'goods').length;
  if (aGoods !== bGoods) return aGoods > bGoods ? a : b;

  return null; // perfect tie — no seal awarded this round
}

function resolveRoundEnd(s: JaipurGameState): JaipurGameState {
  const [a, b] = s.players;

  // Most camels takes the 5-rupee camel token; a tie awards it to nobody.
  if (s.tokens.camelTokenAvailable) {
    if (a.corral.length > b.corral.length) {
      a.tokens.push({ kind: 'camel', value: JAIPUR_CAMEL_TOKEN_VALUE });
    } else if (b.corral.length > a.corral.length) {
      b.tokens.push({ kind: 'camel', value: JAIPUR_CAMEL_TOKEN_VALUE });
    }
    s.tokens.camelTokenAvailable = false;
  }

  for (const p of s.players) recomputeScore(p);

  const winner = determineRoundWinner(s.players);
  s.roundWinners.push(winner ? winner.id : null);
  if (winner) winner.sealsWon += 1;

  // Match over: a player reached the seal target.
  if (winner && winner.sealsWon >= JAIPUR_SEALS_TO_WIN) {
    s.winner = winner.id;
    return s;
  }

  // Otherwise deal a fresh round. The round's loser starts the next one.
  const winnerIdx = winner ? s.players.findIndex(p => p.id === winner.id) : -1;
  const nextStarter = winner
    ? (winnerIdx === 0 ? 1 : 0)
    : (s.roundStarterIndex + 1) % s.players.length;

  const fresh = initJaipurGame(s.players.map(p => p.id), nextStarter);
  fresh.players.forEach((fp, i) => {
    fp.name     = s.players[i].name;
    fp.sealsWon = s.players[i].sealsWon;
  });
  fresh.round        = s.round + 1;
  fresh.roundWinners = s.roundWinners;
  return fresh;
}

// ── Main exported reducer ──────────────────────────────────────────────────────

export function handleJaipurMove(
  state: JaipurGameState,
  move: JaipurMove,
  playerId: string,
): JaipurGameState {
  if (state.winner !== null) throw new GameError('GAME_OVER');

  const s = copyState(state);
  const idx = s.players.findIndex(p => p.id === playerId);
  if (idx === -1) throw new GameError('PLAYER_NOT_FOUND');
  if (s.turn !== idx) throw new GameError('NOT_YOUR_TURN');

  const player = s.players[idx];

  switch (move.type) {
    case 'TAKE_SINGLE': handleTakeSingle(s, player, move); break;
    case 'TAKE_CAMELS': handleTakeCamels(s, player); break;
    case 'TRADE':       handleTrade(s, player, move); break;
    case 'SELL':        handleSell(s, player, move); break;
    default:            throw new GameError('UNKNOWN_MOVE');
  }

  // Round-end is checked before passing the turn; it may start a fresh round.
  if (isRoundEndTriggered(s)) {
    return resolveRoundEnd(s);
  }

  s.turn = (idx + 1) % s.players.length;
  return s;
}

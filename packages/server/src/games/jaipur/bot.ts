// ─────────────────────────────────────────────────────────────────────────────
// Jaipur AI — Determinized Monte Carlo Tree Search (PIMC / single-root ISMCTS).
//
// Jaipur has hidden information (the opponent's hand and the face-down deck).
// At the root we run ONE determinization: every card the bot cannot see is
// reconstructed from the known 55-card composition, shuffled, and re-dealt into
// a hypothetical opponent hand + deck. MCTS then searches that perfect-information
// world. Rollouts reuse the pure `handleJaipurMove` reducer (which itself calls
// `initJaipurGame` when a round ends), so simulations honour the exact rules.
//
// Selection uses UCT:   wins_i / visits_i  +  C * sqrt( ln(visits_parent) / visits_i )
// ─────────────────────────────────────────────────────────────────────────────

import type {
  JaipurGameState, JaipurPlayerState, JaipurCard, JaipurMove,
  GoodsType, CardType, BotDifficulty,
} from '@gamengine/shared';
import {
  JAIPUR_MAX_HAND, JAIPUR_MIN_SALE, JAIPUR_DECK_COMPOSITION,
} from '@gamengine/shared';
import { handleJaipurMove } from './engine.js';

// ── Difficulty → MCTS budget (iterations, exploration constant C, time cap) ────

interface MctsConfig { iterations: number; C: number; timeBudgetMs: number }

const MCTS_CONFIG: Record<BotDifficulty, MctsConfig> = {
  MUY_FACIL:   { iterations: 20,   C: 2.0, timeBudgetMs: 400 },
  FACIL:       { iterations: 100,  C: 1.4, timeBudgetMs: 600 },
  NORMAL:      { iterations: 400,  C: 1.0, timeBudgetMs: 900 },
  DIFICIL:     { iterations: 1500, C: 0.7, timeBudgetMs: 1400 },
  MUY_DIFICIL: { iterations: 4000, C: 0.5, timeBudgetMs: 2200 },
};

const ROLLOUT_STEP_CAP = 250; // safety bound; a Jaipur round always ends well before this

// ── Small utilities ────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function groupGoodsByType(cards: JaipurCard[]): Map<GoodsType, JaipurCard[]> {
  const m = new Map<GoodsType, JaipurCard[]>();
  for (const c of cards) {
    if (c.type === 'camel') continue;
    const t = c.type as GoodsType;
    const arr = m.get(t);
    if (arr) arr.push(c); else m.set(t, [c]);
  }
  return m;
}

// All integer count-vectors over `maxCounts` whose sum is within [minTotal, maxTotal].
function bucketCombos(maxCounts: number[], minTotal: number, maxTotal: number, cap: number): number[][] {
  const res: number[][] = [];
  const cur: number[] = [];
  function rec(i: number, total: number): void {
    if (res.length >= cap) return;
    if (i === maxCounts.length) {
      if (total >= minTotal && total <= maxTotal) res.push([...cur]);
      return;
    }
    for (let n = 0; n <= maxCounts[i] && total + n <= maxTotal; n++) {
      cur.push(n); rec(i + 1, total + n); cur.pop();
      if (res.length >= cap) return;
    }
  }
  rec(0, 0);
  return res;
}

// All integer count-vectors over `maxCounts` whose sum equals exactly `target`.
function exactCombos(maxCounts: number[], target: number, cap: number): number[][] {
  const res: number[][] = [];
  const cur: number[] = [];
  function rec(i: number, remaining: number): void {
    if (res.length >= cap) return;
    if (i === maxCounts.length) {
      if (remaining === 0) res.push([...cur]);
      return;
    }
    const maxN = Math.min(maxCounts[i], remaining);
    for (let n = 0; n <= maxN; n++) {
      cur.push(n); rec(i + 1, remaining - n); cur.pop();
      if (res.length >= cap) return;
    }
  }
  rec(0, target);
  return res;
}

// ── Legal move generation ───────────────────────────────────────────────────────

// Trades are combinatorial; `tradeCap` bounds how many candidate trades we emit
// (a smaller cap is used inside fast rollouts).
function legalJaipurMoves(s: JaipurGameState, idx: number, tradeCap = 30): JaipurMove[] {
  if (s.winner !== null || s.turn !== idx) return [];
  const player = s.players[idx];
  const hand   = player.hand;
  const market = s.market;
  const moves: JaipurMove[] = [];

  // TAKE_SINGLE — one representative per goods type in the market.
  if (hand.length + 1 <= JAIPUR_MAX_HAND) {
    const seen = new Set<CardType>();
    for (const c of market) {
      if (c.type === 'camel' || seen.has(c.type)) continue;
      seen.add(c.type);
      moves.push({ type: 'TAKE_SINGLE', cardId: c.id });
    }
  }

  // TAKE_CAMELS
  if (market.some(c => c.type === 'camel')) moves.push({ type: 'TAKE_CAMELS' });

  // SELL — sell the whole stack of each eligible goods type.
  for (const [type, cards] of groupGoodsByType(hand)) {
    if (cards.length >= JAIPUR_MIN_SALE[type]) {
      moves.push({ type: 'SELL', good: type, cardIds: cards.map(c => c.id) });
    }
  }

  // TRADE
  generateTrades(s, player, tradeCap, moves);

  return moves;
}

function generateTrades(
  s: JaipurGameState, player: JaipurPlayerState, cap: number, out: JaipurMove[],
): void {
  const marketGoods = s.market.filter(c => c.type !== 'camel');
  const camelIds    = player.corral.map(c => c.id);
  const giveableTotal = player.hand.length + camelIds.length;
  if (marketGoods.length < 2 || giveableTotal < 2) return;

  const handByType   = groupGoodsByType(player.hand);
  const marketByType = groupGoodsByType(marketGoods);
  const marketTypes  = [...marketByType.keys()];
  const maxTake      = Math.min(4, marketGoods.length, giveableTotal);

  const start = out.length;
  const takeCombos = bucketCombos(marketTypes.map(t => marketByType.get(t)!.length), 2, maxTake, 40);

  for (const tk of takeCombos) {
    if (out.length - start >= cap) break;
    const takeCount   = tk.reduce((a, b) => a + b, 0);
    const takenTypes  = new Set<GoodsType>();
    const takeIds: string[] = [];
    tk.forEach((n, i) => {
      if (n > 0) {
        const t = marketTypes[i];
        takenTypes.add(t);
        takeIds.push(...marketByType.get(t)!.slice(0, n).map(c => c.id));
      }
    });

    // Give buckets: camels, plus hand goods of types NOT being taken.
    const giveBuckets: { ids: string[]; isCamel: boolean }[] = [];
    if (camelIds.length > 0) giveBuckets.push({ ids: camelIds, isCamel: true });
    for (const [t, cards] of handByType) {
      if (takenTypes.has(t)) continue;
      giveBuckets.push({ ids: cards.map(c => c.id), isCamel: false });
    }
    if (giveBuckets.reduce((a, g) => a + g.ids.length, 0) < takeCount) continue;

    const giveCombos = exactCombos(giveBuckets.map(g => g.ids.length), takeCount, 8);
    for (const gc of giveCombos) {
      if (out.length - start >= cap) break;
      const goodsGiven = gc.reduce((a, n, i) => a + (giveBuckets[i].isCamel ? 0 : n), 0);
      if (player.hand.length - goodsGiven + takeCount > JAIPUR_MAX_HAND) continue;
      const giveIds: string[] = [];
      gc.forEach((n, i) => { if (n > 0) giveIds.push(...giveBuckets[i].ids.slice(0, n)); });
      out.push({ type: 'TRADE', give: giveIds, take: takeIds });
    }
  }
}

// ── Root determinization (resolve hidden information) ────────────────────────────

function cloneState(s: JaipurGameState): JaipurGameState {
  return {
    ...s,
    players: s.players.map(p => ({
      ...p,
      hand:   p.hand.map(c => ({ ...c })),
      corral: p.corral.map(c => ({ ...c })),
      tokens: p.tokens.map(t => ({ ...t })),
    })),
    market:   s.market.map(c => ({ ...c })),
    deck:     s.deck.map(c => ({ ...c })),
    discards: s.discards.map(c => ({ ...c })),
    tokens: {
      goods: Object.fromEntries(
        Object.entries(s.tokens.goods).map(([k, v]) => [k, [...v]]),
      ) as Record<GoodsType, number[]>,
      bonus: {
        bonus3: [...s.tokens.bonus.bonus3],
        bonus4: [...s.tokens.bonus.bonus4],
        bonus5: [...s.tokens.bonus.bonus5],
      },
      camelTokenAvailable: s.tokens.camelTokenAvailable,
    },
    roundWinners: [...s.roundWinners],
  };
}

// Reconstruct the unseen cards (opponent hand + deck) and re-deal them randomly,
// keeping everything the bot can actually observe fixed.
function determinize(root: JaipurGameState, botIndex: number): JaipurGameState {
  const s   = cloneState(root);
  const opp = 1 - botIndex;

  const known: Record<CardType, number> = {
    diamonds: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0, camel: 0,
  };
  const tally = (cards: JaipurCard[]) => { for (const c of cards) known[c.type]++; };
  tally(s.players[botIndex].hand);
  tally(s.players[botIndex].corral);
  tally(s.players[opp].corral);   // camels are visible to both players
  tally(s.market);
  tally(s.discards);

  let seq = 0;
  const hidden: JaipurCard[] = [];
  for (const type of Object.keys(JAIPUR_DECK_COMPOSITION) as CardType[]) {
    const remaining = JAIPUR_DECK_COMPOSITION[type] - known[type];
    for (let i = 0; i < remaining; i++) hidden.push({ id: `det-${type}-${seq++}`, type });
  }
  shuffle(hidden);

  const oppHandCount = s.players[opp].hand.length;
  s.players[opp].hand = hidden.slice(0, oppHandCount);
  s.deck              = hidden.slice(oppHandCount);
  return s;
}

// ── Rollout + reward ─────────────────────────────────────────────────────────────

// Reward in [0,1] from the bot's perspective.
function evaluate(s: JaipurGameState, botIndex: number, startRound: number): number {
  const bot = s.players[botIndex];
  const opp = s.players[1 - botIndex];

  if (s.winner !== null) return s.winner === bot.id ? 1 : 0;

  if (s.round > startRound) {
    // The simulated round just ended — score by who won it + seal standing.
    const last     = s.roundWinners[s.roundWinners.length - 1];
    const sealDiff = bot.sealsWon - opp.sealsWon;
    let r = 0.5 + 0.15 * sealDiff;
    if (last === bot.id) r += 0.18;
    else if (last && last !== bot.id) r -= 0.18;
    return clamp01(r);
  }

  // Step cap hit (rare) — fall back to current rupee margin.
  return clamp01(0.5 + 0.5 * Math.tanh((bot.score - opp.score) / 25));
}

// Random playout until the current round (or the match) ends.
function rollout(state: JaipurGameState, botIndex: number): number {
  let s = state;
  const startRound = s.round;
  let steps = 0;

  while (s.winner === null && s.round === startRound && steps < ROLLOUT_STEP_CAP) {
    const mover = s.turn;
    const moves = legalJaipurMoves(s, mover, 4); // light trade set keeps rollouts fast
    if (moves.length === 0) break;
    const move = moves[(Math.random() * moves.length) | 0];
    try {
      s = handleJaipurMove(s, move, s.players[mover].id);
    } catch {
      break; // defensive: never let a bad candidate abort the whole search
    }
    steps++;
  }

  return evaluate(s, botIndex, startRound);
}

// ── MCTS tree ────────────────────────────────────────────────────────────────────

interface Node {
  state:           JaipurGameState;
  playerJustMoved: number;          // player index whose move produced this state
  move:            JaipurMove | null;
  parent:          Node | null;
  children:        Node[];
  untried:         JaipurMove[];
  visits:          number;
  wins:            number;          // accumulated reward from playerJustMoved's perspective
}

function makeNode(
  state: JaipurGameState, playerJustMoved: number,
  move: JaipurMove | null, parent: Node | null,
): Node {
  const untried = state.winner === null ? shuffle(legalJaipurMoves(state, state.turn, 30)) : [];
  return { state, playerJustMoved, move, parent, children: [], untried, visits: 0, wins: 0 };
}

function selectChild(node: Node, C: number): Node {
  const logN = Math.log(node.visits);
  let best = node.children[0];
  let bestVal = -Infinity;
  for (const c of node.children) {
    const uct = c.wins / c.visits + C * Math.sqrt(logN / c.visits);
    if (uct > bestVal) { bestVal = uct; best = c; }
  }
  return best;
}

function runIteration(root: Node, botIndex: number, C: number): void {
  let node = root;

  // 1. Selection — descend fully expanded nodes by UCT.
  while (node.untried.length === 0 && node.children.length > 0) {
    node = selectChild(node, C);
  }

  // 2. Expansion — add one child for an untried move.
  if (node.untried.length > 0 && node.state.winner === null) {
    const move    = node.untried.pop()!;
    const moverId = node.state.players[node.state.turn].id;
    try {
      const childState = handleJaipurMove(node.state, move, moverId);
      const child = makeNode(childState, node.state.turn, move, node);
      node.children.push(child);
      node = child;
    } catch {
      // Illegal candidate (should not happen) — fall through and just simulate `node`.
    }
  }

  // 3. Simulation
  const reward = rollout(node.state, botIndex);

  // 4. Back-propagation — reward stored relative to each node's mover.
  let n: Node | null = node;
  while (n) {
    n.visits++;
    n.wins += n.playerJustMoved === botIndex ? reward : 1 - reward;
    n = n.parent;
  }
}

// ── Fallback (only if no legal move is generated, which is practically impossible) ─

function fallbackMove(s: JaipurGameState, idx: number): JaipurMove {
  if (s.market.some(c => c.type === 'camel')) return { type: 'TAKE_CAMELS' };
  const good = s.market.find(c => c.type !== 'camel');
  if (good && s.players[idx].hand.length < JAIPUR_MAX_HAND) {
    return { type: 'TAKE_SINGLE', cardId: good.id };
  }
  for (const [type, cards] of groupGoodsByType(s.players[idx].hand)) {
    if (cards.length >= JAIPUR_MIN_SALE[type]) {
      return { type: 'SELL', good: type, cardIds: cards.map(c => c.id) };
    }
  }
  return { type: 'TAKE_CAMELS' };
}

// ── Public entry point ───────────────────────────────────────────────────────────

export function getJaipurBotMove(
  rootState: JaipurGameState, botIndex: number, difficulty: BotDifficulty,
): JaipurMove {
  const cfg = MCTS_CONFIG[difficulty];

  const rootMoves = legalJaipurMoves(rootState, rootState.turn, 30);
  if (rootMoves.length === 0) return fallbackMove(rootState, botIndex);
  if (rootMoves.length === 1) return rootMoves[0];

  // One determinization of the hidden cards, then search that perfect-info world.
  const determinized = determinize(rootState, botIndex);
  const root = makeNode(determinized, 1 - determinized.turn, null, null);

  const deadline = Date.now() + cfg.timeBudgetMs;
  for (let i = 0; i < cfg.iterations; i++) {
    if ((i & 31) === 0 && Date.now() > deadline) break;
    runIteration(root, botIndex, cfg.C);
  }

  // Pick the most-visited (robust) child.
  if (root.children.length === 0) return rootMoves[0];
  let best = root.children[0];
  for (const c of root.children) if (c.visits > best.visits) best = c;
  return best.move ?? rootMoves[0];
}

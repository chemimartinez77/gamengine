// Minimax with alpha-beta pruning for Mancala.
// Operates on raw board arrays (number[14]) without GameState overhead.

const PITS_P0    = [0, 1, 2, 3, 4, 5] as const;
const PITS_P1    = [7, 8, 9, 10, 11, 12] as const;
const STORE_P0   = 6;
const STORE_P1   = 13;
const BOARD_SIZE = 14;

function validMoves(board: number[], turn: number): number[] {
  const pits = turn === 0 ? PITS_P0 : PITS_P1;
  const moves: number[] = [];
  for (let rel = 0; rel < 6; rel++) {
    if (board[pits[rel]] > 0) moves.push(rel);
  }
  return moves;
}

// Applies a relative pit move (0–5) for `turn` and returns the resulting board + next turn.
function simMove(board: number[], turn: number, rel: number): { board: number[]; nextTurn: number } {
  const b          = [...board];
  const absFrom    = turn === 0 ? rel : rel + 7;
  const ownStore   = turn === 0 ? STORE_P0 : STORE_P1;
  const enemyStore = turn === 0 ? STORE_P1 : STORE_P0;
  const ownPits    = turn === 0 ? PITS_P0  : PITS_P1;

  let seeds = b[absFrom];
  b[absFrom] = 0;
  let cur = absFrom;

  while (seeds > 0) {
    cur = (cur + 1) % BOARD_SIZE;
    if (cur === enemyStore) continue;
    b[cur]++;
    seeds--;
  }

  let nextTurn = turn;
  if (cur !== ownStore) {
    // Capture: last seed lands in own previously-empty pit with seeds opposite
    if ((ownPits as readonly number[]).includes(cur) && b[cur] === 1) {
      const opp = 12 - cur;
      if (b[opp] > 0) {
        b[ownStore] += b[opp] + 1;
        b[opp]  = 0;
        b[cur]  = 0;
      }
    }
    nextTurn = 1 - turn;
  }

  // End-of-game sweep
  const p0Empty = PITS_P0.every((i) => b[i] === 0);
  const p1Empty = PITS_P1.every((i) => b[i] === 0);
  if (p0Empty || p1Empty) {
    for (const i of PITS_P0) { b[STORE_P0] += b[i]; b[i] = 0; }
    for (const i of PITS_P1) { b[STORE_P1] += b[i]; b[i] = 0; }
  }

  return { board: b, nextTurn };
}

function isTerminal(board: number[]): boolean {
  return PITS_P0.every((i) => board[i] === 0) || PITS_P1.every((i) => board[i] === 0);
}

// Heuristic: store lead (heavily weighted) + seeds-on-side (tiebreaker)
function evaluate(board: number[], botIndex: number): number {
  const botStore  = botIndex === 0 ? STORE_P0 : STORE_P1;
  const humStore  = botIndex === 0 ? STORE_P1 : STORE_P0;
  const botPits   = (botIndex === 0 ? PITS_P0 : PITS_P1) as readonly number[];
  const humPits   = (botIndex === 0 ? PITS_P1 : PITS_P0) as readonly number[];
  const storeDiff = board[botStore] - board[humStore];
  const sideDiff  = botPits.reduce((s, i) => s + board[i], 0) -
                    humPits.reduce((s, i) => s + board[i], 0);
  return storeDiff * 10 + sideDiff;
}

function minimax(
  board: number[], turn: number, depth: number,
  alpha: number, beta: number, botIndex: number,
): number {
  if (depth === 0 || isTerminal(board)) return evaluate(board, botIndex);

  const moves = validMoves(board, turn);
  if (moves.length === 0) return evaluate(board, botIndex);

  if (turn === botIndex) {
    let best = -Infinity;
    for (const rel of moves) {
      const { board: nb, nextTurn } = simMove(board, turn, rel);
      best  = Math.max(best, minimax(nb, nextTurn, depth - 1, alpha, beta, botIndex));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const rel of moves) {
      const { board: nb, nextTurn } = simMove(board, turn, rel);
      best = Math.min(best, minimax(nb, nextTurn, depth - 1, alpha, beta, botIndex));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function getRandomMancalaMove(board: number[], turn: number): number {
  const moves = validMoves(board, turn);
  return moves[Math.floor(Math.random() * moves.length)];
}

export function getBestMancalaMove(
  board: number[], currentTurn: number, botIndex: number, depth: number,
): number {
  const moves = validMoves(board, currentTurn);
  if (moves.length === 1) return moves[0];

  let bestMove  = moves[0];
  let bestScore = -Infinity;

  for (const rel of moves) {
    const { board: nb, nextTurn } = simMove(board, currentTurn, rel);
    const score = minimax(nb, nextTurn, depth - 1, -Infinity, Infinity, botIndex);
    if (score > bestScore) {
      bestScore = score;
      bestMove  = rel;
    }
  }

  return bestMove;
}

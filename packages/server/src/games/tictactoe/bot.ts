import type { BotDifficulty } from '@gamengine/shared';

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function emptyCells(board: string[]): number[] {
  return board.reduce<number[]>((acc, v, i) => (v === '' ? [...acc, i] : acc), []);
}

function checkWin(board: string[], mark: string): boolean {
  return LINES.some(([a, b, c]) => board[a] === mark && board[b] === mark && board[c] === mark);
}

// Full minimax — TicTacToe's tree is tiny, no pruning needed.
function minimax(board: string[], isMax: boolean, botMark: string, humanMark: string): number {
  if (checkWin(board, botMark))   return 10;
  if (checkWin(board, humanMark)) return -10;
  const empties = emptyCells(board);
  if (empties.length === 0) return 0;

  if (isMax) {
    let best = -Infinity;
    for (const i of empties) {
      board[i] = botMark;
      best = Math.max(best, minimax(board, false, botMark, humanMark));
      board[i] = '';
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of empties) {
      board[i] = humanMark;
      best = Math.min(best, minimax(board, true, botMark, humanMark));
      board[i] = '';
    }
    return best;
  }
}

export function getBestTicTacToeMove(
  board: string[], botIndex: number, difficulty: BotDifficulty,
): number {
  const botMark   = botIndex === 0 ? 'X' : 'O';
  const humanMark = botIndex === 0 ? 'O' : 'X';
  const empty     = emptyCells(board);

  // Muy Fácil: purely random
  if (difficulty === 'MUY_FACIL') {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Fácil: win if possible, block opponent's win, otherwise random
  if (difficulty === 'FACIL') {
    for (const i of empty) {
      const b = [...board]; b[i] = botMark;
      if (checkWin(b, botMark)) return i;
    }
    for (const i of empty) {
      const b = [...board]; b[i] = humanMark;
      if (checkWin(b, humanMark)) return i;
    }
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Normal / Difícil / Muy Difícil: perfect minimax (TicTacToe is fully solvable)
  const b = [...board];
  let bestMove  = empty[0];
  let bestScore = -Infinity;
  for (const i of empty) {
    b[i] = botMark;
    const score = minimax(b, false, botMark, humanMark);
    b[i] = '';
    if (score > bestScore) {
      bestScore = score;
      bestMove  = i;
    }
  }
  return bestMove;
}

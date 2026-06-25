import type { GameState, Move, Player } from '../../../core.js';
import type { GameEngine } from '../../../engine.js';
import { GameError } from '../../../engine.js';

// board: string[] of 9 cells — '' | 'X' | 'O'
// move.data: { cell: number }  (0–8, row-major)

const WINNING_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function detectWinner(board: string[]): boolean {
  return WINNING_LINES.some(
    ([a, b, c]) => board[a] !== '' && board[a] === board[b] && board[b] === board[c]
  );
}

export const ticTacToeEngine: GameEngine = {
  createInitialState(players: Player[]): GameState {
    return {
      players,
      turn: 0,
      board: Array(9).fill(''),
      winner: null,
    };
  },

  processMove(state: GameState, move: Move): GameState {
    const cell: number = move.data.cell;
    const board: string[] = [...(state.board as string[])];

    if (state.players[state.turn].id !== move.playerId) {
      throw new GameError('NOT_YOUR_TURN');
    }
    if (cell < 0 || cell > 8 || board[cell] !== '') {
      throw new GameError('INVALID_MOVE');
    }

    board[cell] = state.turn === 0 ? 'X' : 'O';

    const won = detectWinner(board);
    const draw = !won && board.every((c) => c !== '');

    return {
      players: state.players,
      turn: won || draw ? state.turn : (state.turn + 1) % 2,
      board,
      winner: draw ? 'DRAW' : won ? state.players[state.turn].id : null,
    };
  },
};

import type { GameState, Move, Player, MancalaEvent } from '../../../core.js';
import type { GameEngine } from '../../../engine.js';
import { GameError } from '../../../engine.js';

// Board layout (14 positions):
//   [0..5]  → pits of player 0   (index 0 is leftmost)
//   [6]     → store of player 0
//   [7..12] → pits of player 1   (index 7 is leftmost from player 1's perspective)
//   [13]    → store of player 1
//
// move.data: { pit: number }  (0–5, relative to the active player)

const SEEDS_PER_PIT = 4;
const PITS_PER_SIDE = 6;
const STORE_P0 = 6;
const STORE_P1 = 13;
const BOARD_SIZE = 14;

function storeOf(playerIndex: number): number {
  return playerIndex === 0 ? STORE_P0 : STORE_P1;
}

function pitsOf(playerIndex: number): number[] {
  return playerIndex === 0
    ? [0, 1, 2, 3, 4, 5]
    : [7, 8, 9, 10, 11, 12];
}

function absolutePit(playerIndex: number, relativePit: number): number {
  return playerIndex === 0 ? relativePit : relativePit + 7;
}

function oppositePit(boardIndex: number): number {
  return 12 - boardIndex;
}

function detectWinner(board: number[]): string | null {
  const p0Empty = pitsOf(0).every((i) => board[i] === 0);
  const p1Empty = pitsOf(1).every((i) => board[i] === 0);
  if (!p0Empty && !p1Empty) return null;
  return 'RESOLVE';
}

export const mancalaEngine: GameEngine = {
  createInitialState(players: Player[]): GameState {
    const board = Array(BOARD_SIZE).fill(SEEDS_PER_PIT);
    board[STORE_P0] = 0;
    board[STORE_P1] = 0;
    return { players, turn: 0, board, winner: null };
  },

  processMove(state: GameState, move: Move): GameState {
    const relativePit: number = move.data.pit;
    const board = [...(state.board as number[])];
    const activePlayer = state.turn;
    const events: MancalaEvent[] = [];

    if (state.players[activePlayer].id !== move.playerId) {
      throw new GameError('NOT_YOUR_TURN');
    }
    if (relativePit < 0 || relativePit >= PITS_PER_SIDE) {
      throw new GameError('INVALID_MOVE');
    }

    const fromIndex = absolutePit(activePlayer, relativePit);
    let seeds = board[fromIndex];
    if (seeds === 0) throw new GameError('INVALID_MOVE');

    board[fromIndex] = 0;
    let current = fromIndex;
    const enemyStore = storeOf(1 - activePlayer);
    const ownStore   = storeOf(activePlayer);

    while (seeds > 0) {
      current = (current + 1) % BOARD_SIZE;
      if (current === enemyStore) continue;
      board[current]++;
      seeds--;
    }

    let nextTurn = activePlayer;

    if (current === ownStore) {
      // Last seed landed in own store → extra turn
      events.push({ type: 'EXTRA_TURN', playerIndex: activePlayer });
    } else {
      // Capture: last seed in own empty pit, non-empty opposite pit
      const ownPits = pitsOf(activePlayer);
      if (ownPits.includes(current) && board[current] === 1) {
        const opp = oppositePit(current);
        if (board[opp] > 0) {
          const capturedOpponent = board[opp];
          board[ownStore] += board[opp] + 1;
          board[opp] = 0;
          board[current] = 0;
          events.push({ type: 'CAPTURE', playerIndex: activePlayer, seeds: capturedOpponent });
        }
      }
      nextTurn = 1 - activePlayer;
    }

    // End-of-game sweep
    let winner: string | null = null;
    if (detectWinner(board) === 'RESOLVE') {
      const p0Remaining = pitsOf(0).reduce((s, i) => s + board[i], 0);
      const p1Remaining = pitsOf(1).reduce((s, i) => s + board[i], 0);

      for (const i of pitsOf(0)) { board[STORE_P0] += board[i]; board[i] = 0; }
      for (const i of pitsOf(1)) { board[STORE_P1] += board[i]; board[i] = 0; }

      if (p0Remaining > 0) events.push({ type: 'SWEEP', playerIndex: 0, seeds: p0Remaining });
      if (p1Remaining > 0) events.push({ type: 'SWEEP', playerIndex: 1, seeds: p1Remaining });

      if (board[STORE_P0] > board[STORE_P1]) {
        winner = state.players[0].id;
      } else if (board[STORE_P1] > board[STORE_P0]) {
        winner = state.players[1].id;
      } else {
        winner = 'DRAW';
      }
    }

    return { players: state.players, turn: nextTurn, board, winner, events };
  },
};

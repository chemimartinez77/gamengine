import type { Player, GameState, Move } from './index.js';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export interface GameEngine {
  createInitialState(players: Player[]): GameState;
  processMove(state: GameState, move: Move): GameState;
}

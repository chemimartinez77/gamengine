import type { Player, GameState, Move } from './core.js';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export interface GameEngine {
  createInitialState(players: Player[]): GameState;
  processMove(state: GameState, move: Move): GameState;
  /**
   * Optional: return a version of `state` safe to send to `viewerId`.
   * When present, the server emits per-socket views instead of a room broadcast.
   * Games that need hand-hiding (Virus!, etc.) implement this.
   */
  maskStateFor?(state: GameState, viewerId: string): GameState;
  /** Maximum number of players. Defaults to 4 when absent. */
  maxPlayers?: number;
}

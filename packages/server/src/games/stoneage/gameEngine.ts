import type { GameEngine, GameState, Move, Player } from '@gamengine/shared';
import type { StoneAgeGameState } from '@gamengine/shared';
import { initStoneAgeGame } from './init.js';
import { handleStoneAgeMove } from './engine.js';

export const stoneAgeGameEngine: GameEngine = {
  maxPlayers: 4,

  createInitialState(players: Player[]): GameState {
    const sa = initStoneAgeGame(players);
    return {
      players,
      turn:   sa.turn,
      board:  sa,
      winner: sa.winner,
    };
  },

  processMove(state: GameState, move: Move): GameState {
    const sa   = state.board as StoneAgeGameState;
    const next = handleStoneAgeMove(sa, move);
    return {
      players: state.players,
      turn:    next.turn,
      board:   next,
      winner:  next.winner,
    };
  },
};

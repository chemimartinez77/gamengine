import type { GameEngine, GameState, Move, Player } from '@gamengine/shared';
import type { JaipurGameState, JaipurMove } from '@gamengine/shared';
import { initJaipurGame } from './init.js';
import { handleJaipurMove } from './engine.js';

export const jaipurGameEngine: GameEngine = {
  createInitialState(players: Player[]): GameState {
    const jaipur = initJaipurGame(players.map(p => p.id));
    // initJaipurGame only knows ids; patch in the real display names.
    jaipur.players.forEach((jp, i) => { jp.name = players[i].name; });
    return {
      players,
      turn:   jaipur.turn,
      board:  jaipur,
      winner: jaipur.winner,
    };
  },

  processMove(state: GameState, move: Move): GameState {
    const jaipur = state.board as JaipurGameState;
    const next   = handleJaipurMove(jaipur, move.data as JaipurMove, move.playerId);
    return {
      players: state.players,
      turn:    next.turn,
      board:   next,
      winner:  next.winner,
    };
  },
};

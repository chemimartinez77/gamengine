import type { GameEngine, GameState, Move, Player } from '@gamengine/shared';
import type { VirusGameState, VirusMove, VirusPlayerState } from '@gamengine/shared';
import { initVirusGame } from './init.js';
import { handleVirusMove } from './engine.js';

/**
 * Returns a copy of `state` safe to send to `viewerId`:
 * the viewer's own hand is intact; every opponent's hand is emptied
 * (the client reads handCount for the badge).
 */
function maskVirusState(state: VirusGameState, viewerId: string): VirusGameState {
  return {
    ...state,
    players: state.players.map((p): VirusPlayerState => {
      if (p.id === viewerId) return { ...p };
      return { ...p, hand: [], handCount: p.hand.length };
    }),
  };
}

export const virusGameEngine: GameEngine = {
  maxPlayers: 6,

  createInitialState(players: Player[]): GameState {
    const virus = initVirusGame(players.map(p => p.id));
    virus.players.forEach((vp, i) => { vp.name = players[i].name; vp.isBot = players[i].isBot; });
    return {
      players,
      turn:   virus.turn,
      board:  virus,
      winner: virus.winner,
    };
  },

  processMove(state: GameState, move: Move): GameState {
    const virus  = state.board as VirusGameState;
    const next   = handleVirusMove(virus, move.data as VirusMove, move.playerId);
    return {
      players: state.players,
      turn:    next.turn,
      board:   next,
      winner:  next.winner,
    };
  },

  maskStateFor(state: GameState, viewerId: string): GameState {
    const virus   = state.board as VirusGameState;
    const masked  = maskVirusState(virus, viewerId);
    return {
      players: state.players,
      turn:    masked.turn,
      board:   masked,
      winner:  masked.winner,
    };
  },
};

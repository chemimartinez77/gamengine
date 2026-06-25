import type { GameEngine, GameState, Move, Player } from '@gamengine/shared'
import type { SplendorGameState, SplendorAction } from '@gamengine/shared'
import { initializeSplendorGame } from './init.js'
import { handleSplendorAction } from './engine.js'

export const splendorGameEngine: GameEngine = {
  createInitialState(players: Player[]): GameState {
    const splendorState = initializeSplendorGame(players)
    return {
      players,
      turn:   0,
      board:  splendorState,
      winner: null,
    }
  },

  processMove(state: GameState, move: Move): GameState {
    const splendorState = state.board as SplendorGameState
    const action        = move.data as SplendorAction
    const next          = handleSplendorAction(splendorState, action, move.playerId)
    const turn          = next.players.findIndex(p => p.id === next.activePlayerId)
    return {
      players: state.players,
      turn:    turn >= 0 ? turn : 0,
      board:   next,
      winner:  next.status === 'FINISHED' ? next.winnerId : null,
    }
  },
}

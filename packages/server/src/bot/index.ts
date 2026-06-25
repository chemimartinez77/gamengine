import type { GameState, GameType, Move, BotDifficulty, JaipurGameState } from '@gamengine/shared';
import { getBestMancalaMove, getRandomMancalaMove } from '../games/mancala/bot.js';
import { getBestTicTacToeMove } from '../games/tictactoe/bot.js';
import { getJaipurBotMove } from '../games/jaipur/bot.js';

// Minimax search depth per difficulty for Mancala.
// MUY_FACIL uses random selection (depth is ignored).
const MANCALA_DEPTH: Record<BotDifficulty, number> = {
  MUY_FACIL:   0,
  FACIL:       2,
  NORMAL:      4,
  DIFICIL:     6,
  MUY_DIFICIL: 9,
};

export function getBotMove(
  gameType:   GameType,
  state:      GameState,
  botIndex:   number,
  difficulty: BotDifficulty,
): Move {
  const botPlayerId = state.players[botIndex].id;

  if (gameType === 'MANCALA') {
    const board = state.board as number[];
    const rel   = difficulty === 'MUY_FACIL'
      ? getRandomMancalaMove(board, state.turn)
      : getBestMancalaMove(board, state.turn, botIndex, MANCALA_DEPTH[difficulty]);
    return { type: 'place', playerId: botPlayerId, data: { pit: rel } };
  }

  if (gameType === 'TIC_TAC_TOE') {
    const board = state.board as string[];
    const cell  = getBestTicTacToeMove(board, botIndex, difficulty);
    return { type: 'place', playerId: botPlayerId, data: { cell } };
  }

  if (gameType === 'JAIPUR') {
    const jaipur = state.board as JaipurGameState;
    const move   = getJaipurBotMove(jaipur, botIndex, difficulty);
    return { type: 'place', playerId: botPlayerId, data: move };
  }

  throw new Error(`Unknown game type: ${gameType}`);
}

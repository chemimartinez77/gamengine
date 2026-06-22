import { randomUUID } from 'node:crypto';
import type { GameState, BotDifficulty, GameType } from '@gamengine/shared';
import { Room } from './Room.js';
import { getBotMove } from '../bot/index.js';

export const BOT_SOCKET_ID = '__BOT__';

const DELAY_MIN = 600;
const DELAY_MAX = 1000;

export class BotRoom extends Room {
  // Bot is always inserted as the second player (index 1).
  // Human is added first by the handler, bot is added via addBotPlayer().
  static readonly BOT_INDEX = 1;

  readonly botPlayerId: string;
  readonly difficulty:  BotDifficulty;
  readonly isBot        = true;

  constructor(roomId: string, roomName: string, gameType: GameType, difficulty: BotDifficulty) {
    super(roomId, roomName, gameType);
    this.botPlayerId = randomUUID();
    this.difficulty  = difficulty;
  }

  // Called by the handler after the human player is added.
  addBotPlayer(): void {
    super.addPlayer(BOT_SOCKET_ID, { id: this.botPlayerId, name: '💻 Bot' });
  }

  // Bot rooms are always full (private, single-human).
  override isFull(): boolean {
    return this.getPlayerCount() >= 2;
  }

  // Bot auto-votes for rematch so the game restarts as soon as the human votes.
  override voteRematch(socketId: string): boolean {
    super.voteRematch(BOT_SOCKET_ID);
    return super.voteRematch(socketId);
  }

  // After a human move produces `state`, schedules the bot's reply (600–1000 ms delay).
  // `onBotMove` receives each state the bot produces.
  // Recurses automatically when the bot earns an extra turn (Mancala only).
  scheduleBotMove(state: GameState, onBotMove: (newState: GameState) => void): void {
    if (state.winner !== null || state.turn !== BotRoom.BOT_INDEX) return;

    const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);

    setTimeout(() => {
      const current = this.getGameState();
      if (!current || current.winner !== null || current.turn !== BotRoom.BOT_INDEX) return;

      const move     = getBotMove(this.getCurrentGameType(), current, BotRoom.BOT_INDEX, this.difficulty);
      const newState = this.applyMove(move);
      onBotMove(newState);

      // Extra turn: bot earned another move (Mancala store landing)
      if (newState.winner === null && newState.turn === BotRoom.BOT_INDEX) {
        this.scheduleBotMove(newState, onBotMove);
      }
    }, delay);
  }
}

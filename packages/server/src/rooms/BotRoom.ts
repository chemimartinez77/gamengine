import { randomUUID } from 'node:crypto';
import type { GameState, BotDifficulty, GameType, Player } from '@gamengine/shared';
import { Room } from './Room.js';
import { getBotMove } from '../bot/index.js';

// Bot "socket" IDs are virtual — they exist in the playerMap but never connect.
// Each bot gets a unique suffix so multi-bot rooms have distinct socket IDs.
const BOT_SOCKET_PREFIX = '__BOT__';

const DELAY_MIN = 600;
const DELAY_MAX = 1000;

export class BotRoom extends Room {
  // Static index kept for external code that depends on it (e.g. legacy checks).
  // In 2-player rooms this is always the bot's turn index.
  static readonly BOT_INDEX = 1;

  readonly difficulty: BotDifficulty;
  readonly isBot = true;

  // Track each bot added to this room.
  private readonly _botIds:     string[] = [];
  private readonly _botSockets: string[] = [];
  private readonly _botIndexSet = new Set<number>();

  constructor(roomId: string, roomName: string, gameType: GameType, difficulty: BotDifficulty) {
    super(roomId, roomName, gameType);
    this.difficulty = difficulty;
  }

  // ── Bot accessors ─────────────────────────────────────────────────────────

  /** First bot's player ID (backward-compatible alias). */
  get botPlayerId(): string {
    return this._botIds[0] ?? '';
  }

  /** All bots as Player objects (for emitting player_joined events). */
  getBotPlayers(): Player[] {
    const multi = this._botIds.length > 1;
    return this._botIds.map((id, i) => ({
      id,
      name: multi ? `💻 Bot ${i + 1}` : '💻 Bot',
    }));
  }

  /** True when the player whose turn it is is one of this room's bots. */
  isBotTurn(turn: number): boolean {
    return this._botIndexSet.has(turn);
  }

  // ── Player management ────────────────────────────────────────────────────

  /** Add one bot player. Can be called multiple times for multi-bot rooms. */
  addBotPlayer(): void {
    const botIndex = this.getPlayerCount();  // index the new bot will occupy
    const botId    = randomUUID();
    const socketId = `${BOT_SOCKET_PREFIX}${botIndex}`;

    this._botIds.push(botId);
    this._botSockets.push(socketId);
    this._botIndexSet.add(botIndex);

    super.addPlayer(socketId, { id: botId, name: '💻 Bot' });
  }

  // Bot rooms are full once all bots are added (always private / single-human).
  override isFull(): boolean {
    return this.getPlayerCount() >= (this.getBotPlayers().length + 1);
  }

  // All bots auto-vote for rematch so the game restarts as soon as the human votes.
  override voteRematch(socketId: string): boolean {
    for (const sid of this._botSockets) {
      super.voteRematch(sid);
    }
    return super.voteRematch(socketId);
  }

  // ── Bot turn scheduling ──────────────────────────────────────────────────

  /**
   * Schedule the next bot move if the current turn belongs to a bot.
   * Recursively schedules follow-up bot moves (consecutive bot turns in
   * multi-player rooms, or the Mancala extra-turn case).
   *
   * `onBotMove` is called with the new GameState after each bot action.
   */
  scheduleBotMove(state: GameState, onBotMove: (newState: GameState) => void): void {
    if (state.winner !== null || !this.isBotTurn(state.turn)) return;

    const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);

    setTimeout(() => {
      const current = this.getGameState();
      if (!current || current.winner !== null || !this.isBotTurn(current.turn)) return;

      // This runs detached on the event loop: any throw here (an illegal bot
      // move, a heuristic bug, …) would otherwise become an unhandled async
      // exception and crash the whole server process. Contain it.
      let newState;
      try {
        // Pass the actual turn index so each bot (1, 2, …) is evaluated correctly.
        const move = getBotMove(this.getCurrentGameType(), current, current.turn, this.difficulty);
        newState   = this.applyMove(move);
      } catch (err) {
        console.error(
          `[BotRoom ${this.roomId}] bot move failed (game=${this.getCurrentGameType()}, turn=${current.turn}):`,
          err,
        );
        return; // Leave the room in a valid state; the human can still act / leave.
      }

      onBotMove(newState);

      // Recurse if the next turn also belongs to a bot (consecutive bots, or extra turns).
      if (newState.winner === null && this.isBotTurn(newState.turn)) {
        this.scheduleBotMove(newState, onBotMove);
      }
    }, delay);
  }
}

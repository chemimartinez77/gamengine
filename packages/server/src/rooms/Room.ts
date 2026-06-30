import type { GameState, GameEngine, GameMove, Move, Player, RoomSummary, GameType } from '@gamengine/shared';
import { GameError, ticTacToeEngine, mancalaEngine } from '@gamengine/shared';
import { splendorGameEngine }   from '../games/splendor/gameEngine.js';
import { jaipurGameEngine }     from '../games/jaipur/gameEngine.js';
import { virusGameEngine }      from '../games/virus/gameEngine.js';
import { stoneAgeGameEngine }   from '../games/stoneage/gameEngine.js';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

const DEFAULT_MAX_PLAYERS = 4;

const ENGINE_REGISTRY: Record<GameType, GameEngine> = {
  TIC_TAC_TOE: ticTacToeEngine,
  MANCALA:     mancalaEngine,
  SPLENDOR:    splendorGameEngine,
  JAIPUR:      jaipurGameEngine,
  VIRUS:       virusGameEngine,
  STONE_AGE:   stoneAgeGameEngine,
};

export class Room {
  readonly roomId:   string;
  readonly roomName: string;
  readonly isBot:    boolean = false;
  private currentGameType: GameType;
  private status:    RoomStatus = 'LOBBY';
  private engine:    GameEngine | null = null;
  private gameState: GameState | null = null;
  private playerMap: Map<string, Player> = new Map(); // socketId → Player
  private hostSocketId: string | null = null;
  private rematchVotes: Set<string> = new Set();
  private actionLog: GameMove[] = [];

  constructor(roomId: string, roomName: string, gameType: GameType) {
    this.roomId          = roomId;
    this.roomName        = roomName;
    this.currentGameType = gameType;
  }

  addPlayer(socketId: string, player: Player): void {
    this.playerMap.set(socketId, player);
    if (this.hostSocketId === null) {
      this.hostSocketId = socketId;
    }
  }

  // Returns the playerId of the new host if leadership transferred, null otherwise.
  removePlayer(socketId: string): { player: Player | undefined; newHostPlayerId: string | null } {
    const player = this.playerMap.get(socketId);
    this.playerMap.delete(socketId);
    this.rematchVotes.delete(socketId);

    let newHostPlayerId: string | null = null;

    if (this.hostSocketId === socketId) {
      const nextEntry = this.playerMap.entries().next();
      if (!nextEntry.done) {
        const [nextSocketId, nextPlayer] = nextEntry.value;
        this.hostSocketId = nextSocketId;
        newHostPlayerId = nextPlayer.id;
      } else {
        this.hostSocketId = null;
      }
    }

    return { player, newHostPlayerId };
  }

  getHostPlayerId(): string | null {
    if (this.hostSocketId === null) return null;
    return this.playerMap.get(this.hostSocketId)?.id ?? null;
  }

  getStatus(): RoomStatus {
    return this.status;
  }

  getCurrentGameType(): GameType {
    return this.currentGameType;
  }

  startGame(): void {
    const engine     = ENGINE_REGISTRY[this.currentGameType];
    this.engine      = engine;
    this.status      = 'PLAYING';
    this.actionLog   = [];
    this.rematchVotes.clear();
    this.gameState   = engine.createInitialState([...this.playerMap.values()]);
  }

  // Returns true when all players have voted — caller should start the rematch.
  voteRematch(socketId: string): boolean {
    this.rematchVotes.add(socketId);
    return this.rematchVotes.size >= this.playerMap.size;
  }

  applyMove(move: Move): GameState {
    if (!this.engine || !this.gameState) {
      throw new GameError('GAME_NOT_STARTED');
    }
    const newState = this.engine.processMove(this.gameState, move);
    this.gameState = newState;
    this.actionLog.push({ timestamp: Date.now(), playerId: move.playerId, data: move.data });
    if (newState.winner !== null) {
      this.status = 'FINISHED';
    }
    return newState;
  }

  getGameState(): Readonly<GameState> | null {
    return this.gameState;
  }

  getActionLog(): readonly GameMove[] {
    return this.actionLog;
  }

  getPlayers(): Player[] {
    return [...this.playerMap.values()];
  }

  getPlayerCount(): number {
    return this.playerMap.size;
  }

  isEmpty(): boolean {
    return this.playerMap.size === 0;
  }

  isFull(): boolean {
    const max = ENGINE_REGISTRY[this.currentGameType].maxPlayers ?? DEFAULT_MAX_PLAYERS;
    return this.playerMap.size >= max;
  }

  hasPlayerWithName(name: string): boolean {
    for (const p of this.playerMap.values()) {
      if (p.name === name) return true;
    }
    return false;
  }

  /** When the active engine implements maskStateFor, emit per-socket views. */
  supportsStateMasking(): boolean {
    return typeof this.engine?.maskStateFor === 'function';
  }

  getMaskedStateFor(state: GameState, viewerId: string): GameState {
    return this.engine?.maskStateFor?.(state, viewerId) ?? state;
  }

  toSummary(): RoomSummary {
    const max = ENGINE_REGISTRY[this.currentGameType].maxPlayers ?? DEFAULT_MAX_PLAYERS;
    return {
      roomId:          this.roomId,
      roomName:        this.roomName,
      playerCount:     this.playerMap.size,
      maxPlayers:      max,
      hostId:          this.getHostPlayerId() ?? '',
      status:          this.status,
      currentGameType: this.currentGameType,
    };
  }
}

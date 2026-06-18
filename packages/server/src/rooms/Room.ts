import type { GameState, GameEngine, Move, Player, RoomSummary } from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

const MAX_PLAYERS = 4;

export class Room {
  readonly roomId: string;
  readonly roomName: string;
  private status: RoomStatus = 'LOBBY';
  private engine: GameEngine | null = null;
  private gameState: GameState | null = null;
  private playerMap: Map<string, Player> = new Map(); // socketId → Player
  private hostSocketId: string | null = null;

  constructor(roomId: string, roomName: string) {
    this.roomId = roomId;
    this.roomName = roomName;
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

  startGame(engine: GameEngine): void {
    this.engine = engine;
    this.status = 'PLAYING';
    this.gameState = engine.createInitialState([...this.playerMap.values()]);
  }

  applyMove(move: Move): GameState {
    if (!this.engine || !this.gameState) {
      throw new GameError('GAME_NOT_STARTED');
    }
    const newState = this.engine.processMove(this.gameState, move);
    this.gameState = newState;
    if (newState.winner !== null) {
      this.status = 'FINISHED';
    }
    return newState;
  }

  getGameState(): Readonly<GameState> | null {
    return this.gameState;
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
    return this.playerMap.size >= MAX_PLAYERS;
  }

  hasPlayerWithName(name: string): boolean {
    for (const p of this.playerMap.values()) {
      if (p.name === name) return true;
    }
    return false;
  }

  toSummary(): RoomSummary {
    return {
      roomId:      this.roomId,
      roomName:    this.roomName,
      playerCount: this.playerMap.size,
      maxPlayers:  MAX_PLAYERS,
      hostId:      this.getHostPlayerId() ?? '',
      status:      this.status,
    };
  }
}

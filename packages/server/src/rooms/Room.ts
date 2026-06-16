import type { GameState, GameEngine, Move, Player } from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

export class Room {
  readonly roomId: string;
  private status: RoomStatus = 'LOBBY';
  private engine: GameEngine | null = null;
  private gameState: GameState | null = null;
  private playerMap: Map<string, Player> = new Map(); // socketId → Player

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  addPlayer(socketId: string, player: Player): void {
    this.playerMap.set(socketId, player);
  }

  removePlayer(socketId: string): Player | undefined {
    const player = this.playerMap.get(socketId);
    this.playerMap.delete(socketId);
    return player;
  }

  getStatus(): RoomStatus {
    return this.status;
  }

  // Transitions LOBBY → PLAYING. Delegates initial state creation to the engine.
  startGame(engine: GameEngine): void {
    this.engine = engine;
    this.status = 'PLAYING';
    this.gameState = engine.createInitialState([...this.playerMap.values()]);
  }

  // Delegates move validation and application to the engine; advances status on win.
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

  getPlayerCount(): number {
    return this.playerMap.size;
  }

  isEmpty(): boolean {
    return this.playerMap.size === 0;
  }
}

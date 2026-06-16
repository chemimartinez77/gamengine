import type { GameState, Player } from '@gamengine/shared';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

export class Room {
  readonly roomId: string;
  private status: RoomStatus = 'LOBBY';
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

  // Transitions LOBBY → PLAYING and initialises GameState from current lobby players.
  // Called externally when all players are ready; game-specific board setup happens after.
  startGame(): void {
    this.status = 'PLAYING';
    this.gameState = {
      players: [...this.playerMap.values()],
      turn: 0,
      board: null,
      winner: null,
    };
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

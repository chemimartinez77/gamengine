export interface Player {
  id: string;
  name: string;
}

export interface GameState {
  players: Player[];
  turn: number;
  board: any; // 'any' de momento, cada juego tendrá su propia estructura aquí
  winner: string | null;
}

export interface Move {
  type: string;
  playerId: string;
  data: any;
}

export { type GameEngine, GameError } from './engine.js';

// Socket.IO event contracts — shared between server and client
export interface ServerToClientEvents {
  room_joined:    (roomId: string, gameState: GameState | null) => void;
  player_joined:  (player: Player) => void;
  player_left:    (playerId: string) => void;
  host_changed:   (newHostId: string) => void;
  game_started:   (gameState: GameState) => void;
  state_updated:  (gameState: GameState) => void;
  rooms_updated:  (rooms: RoomSummary[]) => void;
  error:          (message: string) => void;
}

export interface ClientToServerEvents {
  create_room: (
    roomName: string,
    player: Player,
    callback: (roomId: string) => void
  ) => void;
  join_room: (
    roomId: string,
    player: Player,
    callback: (ok: boolean, error?: string) => void
  ) => void;
  leave_room: (
    callback: (ok: boolean) => void
  ) => void;
  send_move: (
    move: Move,
    callback: (ok: boolean, error?: string) => void
  ) => void;
}

export interface SocketData {
  playerId: string | null;
  roomId:   string | null;
}

export interface RoomSummary {
  roomId:      string;
  roomName:    string;
  playerCount: number;
  maxPlayers:  number;
  hostId:      string;
  status:      'LOBBY' | 'PLAYING' | 'FINISHED';
}

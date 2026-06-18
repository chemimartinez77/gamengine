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
  room_joined:   (roomId: string, gameState: GameState | null) => void;
  player_joined: (player: Player) => void;
  player_left:   (playerId: string) => void;
  game_started:  (gameState: GameState) => void;
  state_updated: (gameState: GameState) => void;
  error:         (message: string) => void;
}

export interface ClientToServerEvents {
  create_room: (
    player: Player,
    callback: (roomId: string) => void
  ) => void;
  join_room: (
    roomId: string,
    player: Player,
    callback: (ok: boolean, error?: string) => void
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
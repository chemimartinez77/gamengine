export type GameType = 'TIC_TAC_TOE' | 'MANCALA' | 'SPLENDOR';

export type BotDifficulty = 'MUY_FACIL' | 'FACIL' | 'NORMAL' | 'DIFICIL' | 'MUY_DIFICIL';

export interface Player {
  id: string;
  name: string;
}

export type MancalaEventType = 'EXTRA_TURN' | 'CAPTURE' | 'SWEEP';

export interface MancalaEvent {
  type:        MancalaEventType;
  playerIndex: number;
  seeds?:      number;
}

export interface GameState {
  players: Player[];
  turn: number;
  board: any; // game-specific structure
  winner: string | null;
  events?: MancalaEvent[];
}

export interface Move {
  type: string;
  playerId: string;
  data: any;
}

export interface GameMove {
  timestamp: number;
  playerId:  string;
  data:      unknown;
}

export { type GameEngine, GameError } from './engine.js';
export { ticTacToeEngine } from './tictactoe.js';
export { mancalaEngine } from './mancala.js';
export type { SplendorCard, SplendorNoble, GemType, TokenType, SplendorPlayer, SplendorGameState, SplendorAction } from './splendor.js';
export { LEVEL1_CARDS, LEVEL2_CARDS, LEVEL3_CARDS, NOBLES } from './splendorCards.js';

// Socket.IO event contracts — shared between server and client
export interface ServerToClientEvents {
  room_joined:        (roomId: string, gameState: GameState | null, gameType: GameType) => void;
  player_joined:      (player: Player) => void;
  player_left:        (playerId: string) => void;
  host_changed:       (newHostId: string) => void;
  game_started:       (gameState: GameState) => void;
  state_updated:      (gameState: GameState) => void;
  rooms_updated:      (rooms: RoomSummary[]) => void;
  rematch_requested:  (playerId: string) => void;
  error:              (message: string) => void;
}

export interface ClientToServerEvents {
  create_room: (
    roomName:  string,
    gameType:  GameType,
    player:    Player,
    callback:  (roomId: string) => void
  ) => void;
  create_bot_room: (
    gameType:   GameType,
    difficulty: BotDifficulty,
    player:     Player,
    callback:   (roomId: string) => void
  ) => void;
  join_room: (
    roomId:   string,
    player:   Player,
    callback: (ok: boolean, error?: string) => void
  ) => void;
  leave_room: (
    callback: (ok: boolean) => void
  ) => void;
  start_game: (
    callback: (ok: boolean, error?: string) => void
  ) => void;
  send_move: (
    move:     Move,
    callback: (ok: boolean, error?: string) => void
  ) => void;
  request_rematch: (
    callback: (ok: boolean, error?: string) => void
  ) => void;
}

export interface SocketData {
  playerId: string | null;
  roomId:   string | null;
}

export interface RoomSummary {
  roomId:          string;
  roomName:        string;
  playerCount:     number;
  maxPlayers:      number;
  hostId:          string;
  status:          'LOBBY' | 'PLAYING' | 'FINISHED';
  currentGameType: GameType;
}

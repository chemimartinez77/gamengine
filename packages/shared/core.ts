export type GameType = 'TIC_TAC_TOE' | 'MANCALA' | 'SPLENDOR' | 'JAIPUR';

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

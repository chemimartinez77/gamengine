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
  data: any;
}
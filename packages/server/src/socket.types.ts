import type { Server, Socket } from 'socket.io';
import type { GameState, Player } from '@gamengine/shared';

export interface ServerToClientEvents {
  room_joined:   (roomId: string, gameState: GameState | null) => void;
  player_joined: (player: Player) => void;
  player_left:   (playerId: string) => void;
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
}

export interface SocketData {
  playerId: string | null;
  roomId:   string | null;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

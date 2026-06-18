import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from '@gamengine/shared';

export type { ServerToClientEvents, ClientToServerEvents, SocketData };

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

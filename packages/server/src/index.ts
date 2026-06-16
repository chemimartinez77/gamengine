import http from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from './socket.types.js';
import { RoomManager } from './rooms/index.js';
import { registerHandlers } from './events/index.js';

const httpServer = http.createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { transports: ['websocket'] }
);

const roomManager = RoomManager.getInstance();

io.on('connection', (socket) => {
  socket.data.playerId = null;
  socket.data.roomId = null;
  registerHandlers(io, socket, roomManager);
});

const PORT = process.env['PORT'] ?? 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

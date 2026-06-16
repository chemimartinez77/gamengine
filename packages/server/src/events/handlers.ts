import type { TypedServer, TypedSocket } from '../socket.types.js';
import type { RoomManager } from '../rooms/index.js';
import { GameError } from '@gamengine/shared';

export function registerHandlers(
  io: TypedServer,
  socket: TypedSocket,
  roomManager: RoomManager
): void {
  socket.on('create_room', (player, callback) => {
    const room = roomManager.createRoom();
    room.addPlayer(socket.id, player);
    socket.join(room.roomId);
    socket.data.playerId = player.id;
    socket.data.roomId = room.roomId;
    callback(room.roomId);
  });

  socket.on('join_room', (roomId, player, callback) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      callback(false, 'ROOM_NOT_FOUND');
      return;
    }
    if (room.getStatus() !== 'LOBBY') {
      callback(false, 'GAME_IN_PROGRESS');
      return;
    }
    room.addPlayer(socket.id, player);
    socket.join(roomId);
    socket.data.playerId = player.id;
    socket.data.roomId = roomId;
    // Notify others already in the room, then confirm state to the joiner
    socket.to(roomId).emit('player_joined', player);
    socket.emit('room_joined', roomId, room.getGameState());
    callback(true);
  });

  socket.on('send_move', (move, callback) => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) {
      callback(false, 'NOT_IN_ROOM');
      return;
    }
    const room = roomManager.getRoom(roomId);
    if (!room || room.getStatus() !== 'PLAYING') {
      callback(false, 'GAME_NOT_ACTIVE');
      return;
    }
    // Security: overwrite playerId with the trusted server-side identity,
    // ignoring whatever the client sent in the payload.
    const trustedMove = { ...move, playerId };
    try {
      const newState = room.applyMove(trustedMove);
      io.to(roomId).emit('state_updated', newState);
      callback(true);
    } catch (err) {
      callback(false, err instanceof GameError ? err.message : 'INTERNAL_ERROR');
    }
  });

  socket.on('disconnect', () => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    room.removePlayer(socket.id);
    io.to(roomId).emit('player_left', playerId);

    if (room.isEmpty()) {
      roomManager.deleteRoom(roomId);
    }
  });
}

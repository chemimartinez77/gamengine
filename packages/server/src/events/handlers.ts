import type { TypedServer, TypedSocket } from '../socket.types.js';
import type { RoomManager } from '../rooms/index.js';
import type { GameType } from '@gamengine/shared';
import { GameError } from '@gamengine/shared';

function broadcastRooms(io: TypedServer, roomManager: RoomManager): void {
  io.emit('rooms_updated', roomManager.getRoomList());
}

function handlePlayerLeave(
  io: TypedServer,
  socket: TypedSocket,
  roomManager: RoomManager,
): void {
  const { playerId, roomId } = socket.data;
  if (!roomId || !playerId) return;

  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const { player, newHostPlayerId } = room.removePlayer(socket.id);
  socket.leave(roomId);
  socket.data.playerId = null;
  socket.data.roomId = null;

  if (player) {
    io.to(roomId).emit('player_left', playerId);
  }

  if (room.isEmpty()) {
    roomManager.deleteRoom(roomId);
  } else if (newHostPlayerId !== null) {
    io.to(roomId).emit('host_changed', newHostPlayerId);
  }

  broadcastRooms(io, roomManager);
}

export function registerHandlers(
  io: TypedServer,
  socket: TypedSocket,
  roomManager: RoomManager
): void {
  socket.emit('rooms_updated', roomManager.getRoomList());

  socket.on('create_room', (roomName, gameType, player, callback) => {
    const sanitizedName = roomName.trim();
    const sanitizedNick = player.name.trim();
    if (!sanitizedName || !sanitizedNick) {
      socket.emit('error', 'Room name and nickname cannot be empty');
      return;
    }
    const sanitizedPlayer = { ...player, name: sanitizedNick };
    const room = roomManager.createRoom(sanitizedName, gameType);
    room.addPlayer(socket.id, sanitizedPlayer);
    socket.join(room.roomId);
    socket.data.playerId = sanitizedPlayer.id;
    socket.data.roomId = room.roomId;
    socket.emit('room_joined', room.roomId, room.getGameState(), room.getCurrentGameType());
    socket.emit('player_joined', sanitizedPlayer);
    callback(room.roomId);
    broadcastRooms(io, roomManager);
  });

  socket.on('join_room', (roomId, player, callback) => {
    const sanitizedNick = player.name.trim();
    if (!sanitizedNick) {
      callback(false, 'Nickname cannot be empty');
      return;
    }
    const room = roomManager.getRoom(roomId);
    if (!room) {
      callback(false, 'ROOM_NOT_FOUND');
      return;
    }
    if (room.getStatus() !== 'LOBBY') {
      callback(false, 'GAME_IN_PROGRESS');
      return;
    }
    if (room.isFull()) {
      callback(false, 'Room is full');
      return;
    }
    if (room.hasPlayerWithName(sanitizedNick)) {
      callback(false, 'Nickname is already taken in this room');
      return;
    }
    const sanitizedPlayer = { ...player, name: sanitizedNick };
    room.addPlayer(socket.id, sanitizedPlayer);
    socket.join(roomId);
    socket.data.playerId = sanitizedPlayer.id;
    socket.data.roomId = roomId;
    socket.to(roomId).emit('player_joined', sanitizedPlayer);
    socket.emit('room_joined', roomId, room.getGameState(), room.getCurrentGameType());
    for (const p of room.getPlayers()) {
      socket.emit('player_joined', p);
    }
    callback(true);
    broadcastRooms(io, roomManager);
  });

  socket.on('start_game', (callback) => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) { callback(false, 'NOT_IN_ROOM'); return; }

    const room = roomManager.getRoom(roomId);
    if (!room)                               { callback(false, 'ROOM_NOT_FOUND'); return; }
    if (room.getStatus() !== 'LOBBY')        { callback(false, 'ALREADY_STARTED'); return; }
    if (room.getHostPlayerId() !== playerId) { callback(false, 'NOT_HOST'); return; }
    if (room.getPlayerCount() < 2)           { callback(false, 'NOT_ENOUGH_PLAYERS'); return; }

    room.startGame();
    io.to(roomId).emit('game_started', room.getGameState()!);
    broadcastRooms(io, roomManager);
    callback(true);
  });

  socket.on('leave_room', (callback) => {
    handlePlayerLeave(io, socket, roomManager);
    callback(true);
  });

  socket.on('request_rematch', (callback) => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) { callback(false, 'NOT_IN_ROOM'); return; }

    const room = roomManager.getRoom(roomId);
    if (!room)                           { callback(false, 'ROOM_NOT_FOUND'); return; }
    if (room.getStatus() !== 'FINISHED') { callback(false, 'GAME_NOT_FINISHED'); return; }

    socket.to(roomId).emit('rematch_requested', playerId);

    const allReady = room.voteRematch(socket.id);
    if (allReady) {
      room.startGame();
      io.to(roomId).emit('game_started', room.getGameState()!);
      broadcastRooms(io, roomManager);
    }
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
    handlePlayerLeave(io, socket, roomManager);
  });
}

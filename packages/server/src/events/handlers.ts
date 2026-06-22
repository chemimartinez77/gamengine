import type { TypedServer, TypedSocket } from '../socket.types.js';
import type { RoomManager } from '../rooms/index.js';
import { BotRoom } from '../rooms/BotRoom.js';
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

  // Bot rooms: destroy immediately when the human leaves — no host transfer needed.
  if (room instanceof BotRoom) {
    room.removePlayer(socket.id);
    roomManager.deleteRoom(roomId);
    socket.leave(roomId);
    socket.data.playerId = null;
    socket.data.roomId   = null;
    broadcastRooms(io, roomManager);
    return;
  }

  const { player, newHostPlayerId } = room.removePlayer(socket.id);
  socket.leave(roomId);
  socket.data.playerId = null;
  socket.data.roomId   = null;

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
  roomManager: RoomManager,
): void {
  socket.emit('rooms_updated', roomManager.getRoomList());

  // ── Create a public multiplayer room ────────────────────────────────────────
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
    socket.data.roomId   = room.roomId;
    socket.emit('room_joined', room.roomId, room.getGameState(), room.getCurrentGameType());
    socket.emit('player_joined', sanitizedPlayer);
    callback(room.roomId);
    broadcastRooms(io, roomManager);
  });

  // ── Create a private bot room and start the game immediately ────────────────
  socket.on('create_bot_room', (gameType, difficulty, player, callback) => {
    const sanitizedNick = player.name.trim();
    if (!sanitizedNick) {
      socket.emit('error', 'El apodo no puede estar vacío');
      return;
    }
    const sanitizedPlayer = { ...player, name: sanitizedNick };
    const room = roomManager.createBotRoom(gameType, difficulty);

    // Human is player 0, bot is player 1 — insertion order matters.
    room.addPlayer(socket.id, sanitizedPlayer);
    room.addBotPlayer();

    socket.join(room.roomId);
    socket.data.playerId = sanitizedPlayer.id;
    socket.data.roomId   = room.roomId;

    room.startGame();
    const state = room.getGameState()!;

    // Emit room_joined first (null gameState — game_started follows immediately)
    socket.emit('room_joined', room.roomId, null, room.getCurrentGameType());
    socket.emit('player_joined', sanitizedPlayer);
    socket.emit('player_joined', { id: room.botPlayerId, name: '💻 Bot' });
    socket.emit('game_started', state);
    callback(room.roomId);
    // Bot rooms intentionally excluded from broadcastRooms (private, single-player)
  });

  // ── Join an existing public room ─────────────────────────────────────────────
  socket.on('join_room', (roomId, player, callback) => {
    const sanitizedNick = player.name.trim();
    if (!sanitizedNick) {
      callback(false, 'Nickname cannot be empty');
      return;
    }
    const room = roomManager.getRoom(roomId);
    if (!room || room instanceof BotRoom) {
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
    socket.data.roomId   = roomId;
    socket.to(roomId).emit('player_joined', sanitizedPlayer);
    socket.emit('room_joined', roomId, room.getGameState(), room.getCurrentGameType());
    for (const p of room.getPlayers()) {
      socket.emit('player_joined', p);
    }
    callback(true);
    broadcastRooms(io, roomManager);
  });

  // ── Host starts a public room game ───────────────────────────────────────────
  socket.on('start_game', (callback) => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) { callback(false, 'NOT_IN_ROOM'); return; }

    const room = roomManager.getRoom(roomId);
    if (!room)                               { callback(false, 'ROOM_NOT_FOUND'); return; }
    if (room instanceof BotRoom)             { callback(false, 'NOT_APPLICABLE'); return; }
    if (room.getStatus() !== 'LOBBY')        { callback(false, 'ALREADY_STARTED'); return; }
    if (room.getHostPlayerId() !== playerId) { callback(false, 'NOT_HOST'); return; }
    if (room.getPlayerCount() < 2)           { callback(false, 'NOT_ENOUGH_PLAYERS'); return; }

    room.startGame();
    io.to(roomId).emit('game_started', room.getGameState()!);
    broadcastRooms(io, roomManager);
    callback(true);
  });

  // ── Leave room ───────────────────────────────────────────────────────────────
  socket.on('leave_room', (callback) => {
    handlePlayerLeave(io, socket, roomManager);
    callback(true);
  });

  // ── Request rematch ──────────────────────────────────────────────────────────
  socket.on('request_rematch', (callback) => {
    const { playerId, roomId } = socket.data;
    if (!roomId || !playerId) { callback(false, 'NOT_IN_ROOM'); return; }

    const room = roomManager.getRoom(roomId);
    if (!room)                           { callback(false, 'ROOM_NOT_FOUND'); return; }
    if (room.getStatus() !== 'FINISHED') { callback(false, 'GAME_NOT_FINISHED'); return; }

    // In multiplayer rooms broadcast the vote; bot rooms resolve instantly.
    if (!(room instanceof BotRoom)) {
      socket.to(roomId).emit('rematch_requested', playerId);
    }

    const allReady = room.voteRematch(socket.id);
    if (allReady) {
      room.startGame();
      const state = room.getGameState()!;
      io.to(roomId).emit('game_started', state);
      broadcastRooms(io, roomManager);

      // Schedule first bot move if bot goes first after rematch
      if (room instanceof BotRoom && state.winner === null && state.turn === BotRoom.BOT_INDEX) {
        room.scheduleBotMove(state, (botState) => {
          io.to(roomId).emit('state_updated', botState);
        });
      }
    }
    callback(true);
  });

  // ── Send a move ──────────────────────────────────────────────────────────────
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

      // After a human move in a bot room, schedule the bot's reply if it's now its turn.
      if (room instanceof BotRoom && newState.winner === null && newState.turn === BotRoom.BOT_INDEX) {
        room.scheduleBotMove(newState, (botState) => {
          io.to(roomId).emit('state_updated', botState);
        });
      }
    } catch (err) {
      callback(false, err instanceof GameError ? err.message : 'INTERNAL_ERROR');
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    handlePlayerLeave(io, socket, roomManager);
  });
}

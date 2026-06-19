import { useState, useEffect } from 'react'
import type { GameType, Player, RoomSummary } from '@gamengine/shared'
import type { AppSocket } from '../context/SocketContext'

const GAME_TYPE_LABELS: Record<GameType, string> = {
  TIC_TAC_TOE: 'Tic-Tac-Toe',
  MANCALA:     'Mancala',
}

interface LobbyProps { socket: AppSocket }

export function Lobby({ socket }: LobbyProps) {
  const [nick, setNick]         = useState('')
  const [roomName, setRoomName] = useState('')
  const [gameType, setGameType] = useState<GameType>('TIC_TAC_TOE')
  const [joinId, setJoinId]     = useState('')
  const [rooms, setRooms]       = useState<RoomSummary[]>([])
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const handleRoomsUpdated = (list: RoomSummary[]) => setRooms(list)
    socket.on('rooms_updated', handleRoomsUpdated)
    return () => { socket.off('rooms_updated', handleRoomsUpdated) }
  }, [socket])

  function makePlayer(): Player {
    return { id: socket.id ?? crypto.randomUUID(), name: nick.trim() }
  }

  function handleCreate() {
    if (!nick.trim() || !roomName.trim()) return
    setError(null)
    socket.emit('create_room', roomName.trim(), gameType, makePlayer(), (roomId) => {
      console.log('Room created:', roomId)
    })
  }

  function handleJoinById() {
    if (!nick.trim() || !joinId.trim()) return
    setError(null)
    socket.emit('join_room', joinId.trim().toUpperCase(), makePlayer(), (ok, err) => {
      if (!ok) setError(err ?? 'Unknown error')
    })
  }

  function handleJoinRoom(roomId: string) {
    if (!nick.trim()) { setError('Enter your name first'); return }
    setError(null)
    socket.emit('join_room', roomId, makePlayer(), (ok, err) => {
      if (!ok) setError(err ?? 'Unknown error')
    })
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Gamengine Lobby</h1>

      {/* Nick global */}
      <section style={styles.section}>
        <label style={styles.label}>Your nickname</label>
        <input
          style={styles.input}
          placeholder="e.g. Chemi1"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
        />
      </section>

      <div style={styles.columns}>
        {/* Crear sala */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Create a room</h2>
          <input
            style={styles.input}
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <select
            style={styles.select}
            value={gameType}
            onChange={(e) => setGameType(e.target.value as GameType)}
          >
            <option value="TIC_TAC_TOE">Tic-Tac-Toe</option>
            <option value="MANCALA">Mancala</option>
          </select>
          <button style={styles.btnPrimary} onClick={handleCreate}>
            Create room
          </button>
        </section>

        {/* Unirse por código */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Join by code</h2>
          <input
            style={styles.input}
            placeholder="Room ID (e.g. AB12CD)"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button style={styles.btnSecondary} onClick={handleJoinById}>
            Join room
          </button>
        </section>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* Listado de salas */}
      <section style={{ ...styles.section, marginTop: 32 }}>
        <h2 style={styles.cardTitle}>Available rooms</h2>
        {rooms.length === 0 ? (
          <p style={styles.empty}>No rooms yet. Be the first to create one!</p>
        ) : (
          <ul style={styles.roomList}>
            {rooms.map((room) => {
              const full = room.playerCount >= room.maxPlayers
              return (
                <li key={room.roomId} style={styles.roomItem}>
                  <div>
                    <span style={styles.roomName}>{room.roomName}</span>
                    <span style={styles.roomMeta}>
                      {' · '}{room.roomId}{' · '}{GAME_TYPE_LABELS[room.currentGameType]}
                    </span>
                  </div>
                  <div style={styles.roomRight}>
                    <span style={styles.roomCount}>
                      {room.playerCount}/{room.maxPlayers}
                    </span>
                    <button
                      style={{ ...styles.btnJoin, ...(full ? styles.btnJoinDisabled : {}) }}
                      disabled={full}
                      onClick={() => handleJoinRoom(room.roomId)}
                    >
                      {full ? 'Full' : 'Join'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:           { maxWidth: 640, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' },
  title:          { marginBottom: 24 },
  section:        { marginBottom: 16 },
  label:          { display: 'block', marginBottom: 6, fontWeight: 600 },
  input:          { display: 'block', width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' },
  select:         { display: 'block', width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box', background: '#fff' },
  columns:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card:           { border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 },
  cardTitle:      { marginTop: 0, marginBottom: 12, fontSize: 16 },
  btnPrimary:     { width: '100%', padding: '8px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  btnSecondary:   { width: '100%', padding: '8px 0', background: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  error:          { color: '#d32f2f', marginTop: 8 },
  empty:          { color: '#888', fontStyle: 'italic' },
  roomList:       { listStyle: 'none', padding: 0, margin: 0 },
  roomItem:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' },
  roomName:       { fontWeight: 600 },
  roomMeta:       { color: '#888', fontSize: 12 },
  roomRight:      { display: 'flex', alignItems: 'center', gap: 12 },
  roomCount:      { color: '#555', fontSize: 13 },
  btnJoin:        { padding: '4px 14px', background: '#34a853', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  btnJoinDisabled:{ background: '#bdbdbd', cursor: 'not-allowed' },
}

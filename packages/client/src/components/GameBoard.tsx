import type { GameState, Move, Player } from '@gamengine/shared'
import type { AppSocket } from '../context/SocketContext'

interface GameBoardProps {
  socket:    AppSocket
  gameState: GameState | null
  roomId:    string
  players:   Player[]
  hostId:    string | null
  leaveRoom: () => void
}

export function GameBoard({ socket, gameState, roomId, players, hostId, leaveRoom }: GameBoardProps) {
  const myPlayerId = socket.id
  const isHost     = myPlayerId !== undefined && hostId === myPlayerId

  function sendMove(moveData: unknown) {
    if (!myPlayerId) return
    const move: Move = { type: 'play', playerId: myPlayerId, data: moveData }
    socket.emit('send_move', move, (ok, err) => {
      if (!ok) console.error('Move rejected:', err)
    })
  }

  if (!gameState) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Waiting for game to start…</h2>
            <p style={styles.roomId}>Room: <strong>{roomId}</strong></p>
          </div>
          <button style={styles.btnLeave} onClick={leaveRoom}>Leave room</button>
        </div>

        <div style={styles.playerList}>
          <span style={styles.playersLabel}>Players in room:</span>
          {players.length === 0 ? (
            <span style={styles.empty}> —</span>
          ) : (
            <ul style={styles.list}>
              {players.map((p) => (
                <li key={p.id} style={styles.playerItem}>
                  {p.name}
                  {p.id === myPlayerId && <span style={styles.you}> (you)</span>}
                  {p.id === hostId && <span style={styles.hostBadge}> ★ host</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {isHost && (
          <button style={styles.btnStart} disabled>
            Start game (coming soon)
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2>Turn {gameState.turn}</h2>
        <button style={styles.btnLeave} onClick={leaveRoom}>Leave room</button>
      </div>
      {gameState.winner && <h3>Winner: {gameState.winner}</h3>}
      <pre>{JSON.stringify(gameState.board, null, 2)}</pre>
      <button onClick={() => sendMove({ cell: 0 })}>Make move</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 480, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title:       { margin: 0 },
  roomId:      { color: '#555', margin: '4px 0 0' },
  playerList:  { background: '#f5f5f5', borderRadius: 8, padding: '16px 20px', marginTop: 24 },
  playersLabel:{ fontWeight: 600 },
  empty:       { color: '#aaa' },
  list:        { listStyle: 'none', padding: 0, margin: '8px 0 0' },
  playerItem:  { padding: '4px 0', fontSize: 15 },
  you:         { color: '#1a73e8', fontSize: 13 },
  hostBadge:   { color: '#f09c00', fontSize: 13, fontWeight: 600 },
  btnLeave:    { padding: '6px 14px', background: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 6, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnStart:    { marginTop: 24, width: '100%', padding: '10px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontWeight: 600, opacity: 0.6, fontSize: 15 },
}

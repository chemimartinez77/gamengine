// Board layout: [0..5] player0 pits, [6] store0, [7..12] player1 pits, [13] store1
// onMove receives a relative pit index (0–5) for the active player.

interface MancalaBoardProps {
  board:      number[]
  isMyTurn:   boolean
  gameOver:   boolean
  myIndex:    number   // 0 or 1 — which side of the board belongs to this client
  onMove:     (relativePit: number) => void
}

export function MancalaBoard({ board, isMyTurn, gameOver, myIndex, onMove }: MancalaBoardProps) {
  const p0Pits  = board.slice(0, 6)
  const store0  = board[6]
  const p1Pits  = board.slice(7, 13)
  const store1  = board[13]

  function pitButton(relativePit: number, playerIndex: number) {
    const seeds   = playerIndex === 0 ? p0Pits[relativePit] : p1Pits[relativePit]
    const isOwner = playerIndex === myIndex
    const disabled = !isMyTurn || gameOver || !isOwner || seeds === 0
    return (
      <button
        key={relativePit}
        style={{
          ...styles.pit,
          cursor: disabled ? 'default' : 'pointer',
          background: disabled ? '#f5f5f5' : '#fff3e0',
          borderColor: disabled ? '#e0e0e0' : '#fb8c00',
        }}
        disabled={disabled}
        onClick={() => onMove(relativePit)}
      >
        {seeds}
      </button>
    )
  }

  return (
    <div style={styles.board}>
      {/* Player 1 store (left) */}
      <div style={styles.store}>
        <div style={styles.storeLabel}>P2</div>
        <div style={styles.storeCount}>{store1}</div>
      </div>

      {/* Pits area */}
      <div style={styles.pitsArea}>
        {/* Player 1 row — reversed so pit 0 is on the right (closest to store0) */}
        <div style={styles.row}>
          {[...p1Pits.keys()].reverse().map((i) => pitButton(i, 1))}
        </div>
        {/* Player 0 row */}
        <div style={styles.row}>
          {p0Pits.map((_, i) => pitButton(i, 0))}
        </div>
      </div>

      {/* Player 0 store (right) */}
      <div style={styles.store}>
        <div style={styles.storeLabel}>P1</div>
        <div style={styles.storeCount}>{store0}</div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  board:      { display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 },
  store:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 56, height: 120, border: '2px solid #e0e0e0', borderRadius: 28, background: '#fafafa' },
  storeLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  storeCount: { fontSize: 28, fontWeight: 700 },
  pitsArea:   { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 },
  row:        { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  pit:        { aspectRatio: '1', fontSize: 18, fontWeight: 700, border: '2px solid #e0e0e0', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}

// Board layout (14 slots):
//   [0..5]  → pits of player 0 (left→right)
//   [6]     → store of player 0
//   [7..12] → pits of player 1 (left→right from player 1's perspective)
//   [13]    → store of player 1
//
// onMove receives a relative pit index (0–5) for the active player.

interface MancalaBoardProps {
  board:          number[]
  isMyTurn:       boolean
  gameOver:       boolean
  myIndex:        number    // 0 or 1
  winnerId:       string | null
  myPlayerId:     string | undefined
  onMove:         (relativePit: number) => void
  playerNames?:   [string, string]  // [p0name, p1name]
  onLeave:        () => void
  onRematch:      () => void
  rematchVotes:   string[]
  playerCount:    number
}

// Renders up to 12 seeds as dots; falls back to a plain number above that.
function Seeds({ count }: { count: number }) {
  if (count === 0) return <span style={seedStyles.empty}>·</span>
  if (count > 12)  return <span style={seedStyles.bigNumber}>{count}</span>
  return (
    <span style={seedStyles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={seedStyles.dot} />
      ))}
    </span>
  )
}

const seedStyles: Record<string, React.CSSProperties> = {
  empty:     { color: '#ccc', fontSize: 18 },
  bigNumber: { fontSize: 22, fontWeight: 700 },
  grid:      { display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center', alignItems: 'center', width: '100%' },
  dot:       { width: 8, height: 8, borderRadius: '50%', background: '#795548', display: 'inline-block', flexShrink: 0 },
}

export function MancalaBoard({
  board, isMyTurn, gameOver, myIndex, winnerId, myPlayerId,
  onMove, onLeave, onRematch, rematchVotes, playerCount,
  playerNames = ['Player 1', 'Player 2'],
}: MancalaBoardProps) {
  const p0Pits = board.slice(0, 6)   // absolute indices 0–5
  const store0 = board[6]
  const p1Pits = board.slice(7, 13)  // absolute indices 7–12
  const store1 = board[13]

  function Pit({ relativePit, playerIndex }: { relativePit: number; playerIndex: number }) {
    const seeds    = playerIndex === 0 ? p0Pits[relativePit] : p1Pits[relativePit]
    const isOwner  = playerIndex === myIndex
    const canClick = isMyTurn && !gameOver && isOwner && seeds > 0
    return (
      <button
        style={{
          ...styles.pit,
          cursor:     canClick ? 'pointer' : 'default',
          background: canClick ? '#fff8f0' : '#fafafa',
          border:     `2px solid ${canClick ? '#fb8c00' : '#e0e0e0'}`,
          opacity:    !isOwner ? 0.6 : 1,
        }}
        disabled={!canClick}
        onClick={() => onMove(relativePit)}
        title={canClick ? `Move pit ${relativePit + 1} (${seeds} seeds)` : undefined}
      >
        <Seeds count={seeds} />
      </button>
    )
  }

  function Store({ playerIndex, count }: { playerIndex: number; count: number }) {
    const isMyStore = playerIndex === myIndex
    const name      = playerNames[playerIndex]
    return (
      <div style={{
        ...styles.store,
        border:     `2px solid ${isMyStore ? '#1a73e8' : '#e0e0e0'}`,
        background: isMyStore ? '#e8f0fe' : '#fafafa',
      }}>
        <span style={styles.storeLabel}>{name}</span>
        <span style={styles.storeCount}>{count}</span>
        <span style={styles.storeSubLabel}>store</span>
      </div>
    )
  }

  // Derive end-game display info
  const isDraw    = winnerId === 'DRAW'
  const iWon      = !isDraw && winnerId !== null && winnerId === myPlayerId
  const iLost     = !isDraw && winnerId !== null && winnerId !== myPlayerId
  const winnerName = isDraw
    ? null
    : winnerId === myPlayerId
      ? playerNames[myIndex]
      : playerNames[1 - myIndex]

  const hasVoted = myPlayerId !== undefined && rematchVotes.includes(myPlayerId)

  // The visual layout is always from P1's perspective on top, P0 on bottom.
  // P1's pits are shown reversed (pit 5 on left, pit 0 on right) so they face P0's pits.
  // Stores: P1 store on the left, P0 store on the right.

  return (
    <div style={styles.wrapper}>
      {/* Turn indicator strip */}
      <div style={styles.turnStrip}>
        <span style={{ ...styles.turnDot, background: isMyTurn ? '#1a73e8' : '#e0e0e0' }} />
        <span style={styles.turnText}>
          {gameOver ? 'Game over' : isMyTurn ? 'Your turn — pick a pit' : `${playerNames[1 - myIndex]}'s turn`}
        </span>
      </div>

      <div style={styles.board}>
        {/* P1 store — left side */}
        <Store playerIndex={1} count={store1} />

        {/* Two rows of 6 pits */}
        <div style={styles.pitsArea}>
          {/* P1 row — reversed so pit closest to P1's store is on the left */}
          <div style={styles.row}>
            {[5, 4, 3, 2, 1, 0].map((i) => (
              <Pit key={i} relativePit={i} playerIndex={1} />
            ))}
          </div>

          {/* Pit index labels */}
          <div style={styles.indexRow}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} style={styles.indexLabel}>{n}</span>
            ))}
          </div>

          {/* P0 row — left-to-right */}
          <div style={styles.row}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Pit key={i} relativePit={i} playerIndex={0} />
            ))}
          </div>
        </div>

        {/* P0 store — right side */}
        <Store playerIndex={0} count={store0} />
      </div>

      {/* Player labels below the board */}
      <div style={styles.playerLabels}>
        <span style={styles.playerLabel}>
          ↑ {playerNames[1]}{myIndex === 1 ? ' (you)' : ''}
        </span>
        <span style={styles.playerLabel}>
          ↓ {playerNames[0]}{myIndex === 0 ? ' (you)' : ''}
        </span>
      </div>

      {/* ── End-game overlay ───────────────────────────────────────────────── */}
      {gameOver && (
        <div style={styles.overlay}>
          {/* Result headline */}
          <div style={{
            ...styles.resultBadge,
            background: isDraw ? '#f5f5f5' : iWon ? '#e8f5e9' : '#fce4ec',
            borderColor: isDraw ? '#bdbdbd' : iWon ? '#43a047' : '#e53935',
          }}>
            <span style={{
              ...styles.resultEmoji,
            }}>
              {isDraw ? '🤝' : iWon ? '🏆' : '😔'}
            </span>
            <span style={{
              ...styles.resultTitle,
              color: isDraw ? '#555' : iWon ? '#2e7d32' : '#c62828',
            }}>
              {isDraw
                ? "It's a Tie!"
                : iWon
                  ? 'You Win!'
                  : iLost
                    ? 'You Lose'
                    : `${winnerName} Wins!`}
            </span>
            {!isDraw && winnerName && (
              <span style={styles.resultSub}>
                {iWon ? `Well played, ${playerNames[myIndex]}!` : `${winnerName} wins this round.`}
              </span>
            )}
          </div>

          {/* Final scores */}
          <div style={styles.scoreRow}>
            {([0, 1] as const).map((pi) => (
              <div
                key={pi}
                style={{
                  ...styles.scoreCard,
                  border: `2px solid ${pi === myIndex ? '#1a73e8' : '#e0e0e0'}`,
                  background: pi === myIndex ? '#e8f0fe' : '#fafafa',
                }}
              >
                <span style={styles.scoreName}>
                  {playerNames[pi]}{pi === myIndex ? ' (you)' : ''}
                </span>
                <span style={styles.scoreValue}>
                  {pi === 0 ? store0 : store1}
                </span>
                <span style={styles.scoreLabel}>seeds</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={styles.actionRow}>
            {hasVoted ? (
              <button style={styles.btnWaiting} disabled>
                Waiting for opponent… ({rematchVotes.length}/{playerCount})
              </button>
            ) : (
              <button style={styles.btnRematch} onClick={onRematch}>
                Rematch
              </button>
            )}
            <button style={styles.btnLeave} onClick={onLeave}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:      { marginTop: 16 },
  turnStrip:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  turnDot:      { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  turnText:     { fontSize: 13, color: '#555' },
  board:        { display: 'flex', alignItems: 'stretch', gap: 10 },
  store:        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 64, minHeight: 140, borderRadius: 32, padding: '12px 0', gap: 4 },
  storeLabel:   { fontSize: 11, fontWeight: 600, color: '#555', textAlign: 'center', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  storeCount:   { fontSize: 32, fontWeight: 700, lineHeight: 1 },
  storeSubLabel:{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },
  pitsArea:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  row:          { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  indexRow:     { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  indexLabel:   { textAlign: 'center', fontSize: 10, color: '#bbb', userSelect: 'none' },
  pit:          { aspectRatio: '1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, minWidth: 0 },
  playerLabels: { display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '0 74px' },
  playerLabel:  { fontSize: 12, color: '#777' },

  // End-game overlay
  overlay:      { marginTop: 24, borderRadius: 12, border: '1px solid #e0e0e0', padding: '24px 20px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'stretch' },
  resultBadge:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, borderRadius: 10, border: '2px solid', padding: '20px 16px' },
  resultEmoji:  { fontSize: 40, lineHeight: 1 },
  resultTitle:  { fontSize: 28, fontWeight: 800, lineHeight: 1.1, textAlign: 'center' },
  resultSub:    { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 2 },
  scoreRow:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  scoreCard:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderRadius: 10, padding: '14px 8px' },
  scoreName:    { fontSize: 12, fontWeight: 600, color: '#555', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  scoreValue:   { fontSize: 36, fontWeight: 800, lineHeight: 1, color: '#333' },
  scoreLabel:   { fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },
  actionRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  btnRematch:   { padding: '10px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  btnWaiting:   { padding: '10px 0', background: '#bdbdbd', color: '#fff', border: 'none', borderRadius: 8, cursor: 'not-allowed', fontWeight: 700, fontSize: 14, opacity: 0.8 },
  btnLeave:     { padding: '10px 0', background: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
}

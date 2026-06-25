interface TicTacToeGridProps {
  board:    string[]
  isMyTurn: boolean
  gameOver: boolean
  onMove:   (cellIndex: number) => void
}

export function TicTacToeGrid({ board, isMyTurn, gameOver, onMove }: TicTacToeGridProps) {
  return (
    <div style={styles.grid}>
      {board.map((cell, i) => {
        const disabled = !isMyTurn || cell !== '' || gameOver
        return (
          <button
            key={i}
            style={{
              ...styles.cell,
              color: cell === 'X' ? '#1a73e8' : '#d32f2f',
              cursor: disabled ? 'default' : 'pointer',
              background: disabled && cell === '' ? '#fafafa' : '#fff',
            }}
            disabled={disabled}
            onClick={() => onMove(i)}
          >
            {cell}
          </button>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
  cell: { aspectRatio: '1', fontSize: 48, fontWeight: 700, border: '2px solid #e0e0e0', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}

import type { GameState, GameType, Move, Player } from '@gamengine/shared'
import type { SplendorGameState, JaipurGameState, JaipurMove, VirusGameState, VirusMove } from '@gamengine/shared'
import type { AppSocket } from '../context/SocketContext'
import { TicTacToeGrid } from './games/tictactoe/TicTacToeGrid'
import { MancalaBoard } from './games/mancala/MancalaBoard'
import { SplendorBoard } from './games/splendor/SplendorBoard'
import { JaipurBoard } from './games/jaipur/JaipurBoard'
import { VirusBoard } from './games/virus/VirusBoard'

interface GameBoardProps {
  socket:          AppSocket
  gameState:       GameState | null
  roomId:          string
  currentGameType: GameType
  players:         Player[]
  hostId:          string | null
  rematchVotes:    string[]
  leaveRoom:       () => void
  startGame:       () => void
  requestRematch:  () => void
}

export function GameBoard({
  socket, gameState, roomId, currentGameType,
  players, hostId, rematchVotes,
  leaveRoom, startGame, requestRematch,
}: GameBoardProps) {
  const myPlayerId = socket.id
  const isHost     = myPlayerId !== undefined && hostId === myPlayerId

  function sendMove(data: unknown) {
    if (!myPlayerId) return
    const move: Move = { type: 'place', playerId: myPlayerId, data }
    socket.emit('send_move', move, (ok, err) => {
      if (!ok) console.error('Move rejected:', err)
    })
  }

  // ── Waiting screen ────────────────────────────────────────────────────────
  if (!gameState) {
    const canStart = isHost && players.length >= 2
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
          <button
            style={{ ...styles.btnStart, ...(canStart ? styles.btnStartActive : {}) }}
            disabled={!canStart}
            onClick={startGame}
          >
            {canStart ? 'Start game' : 'Waiting for players…'}
          </button>
        )}
      </div>
    )
  }

  // ── Game screen ───────────────────────────────────────────────────────────
  const currentId = gameState.players[gameState.turn]?.id
  const isMyTurn  = currentId === myPlayerId
  const gameOver  = gameState.winner !== null
  const myIndex   = gameState.players.findIndex((p) => p.id === myPlayerId)
  const mySymbol  = myIndex === 0 ? 'X' : 'O'

  // Splendor manages its own full-page layout
  if (currentGameType === 'SPLENDOR') {
    return (
      <SplendorBoard
        splendorState={gameState.board as SplendorGameState}
        myPlayerId={myPlayerId}
        isMyTurn={isMyTurn}
        gameOver={gameOver}
        onAction={(action) => sendMove(action)}
        onLeave={leaveRoom}
        onRematch={requestRematch}
        rematchVotes={rematchVotes}
        playerCount={players.length}
      />
    )
  }

  // Jaipur manages its own full-page layout
  if (currentGameType === 'JAIPUR') {
    return (
      <JaipurBoard
        jaipurState={gameState.board as JaipurGameState}
        myPlayerId={myPlayerId}
        isMyTurn={isMyTurn}
        gameOver={gameOver}
        onAction={(move: JaipurMove) => sendMove(move)}
        onLeave={leaveRoom}
        onRematch={requestRematch}
        rematchVotes={rematchVotes}
        playerCount={players.length}
      />
    )
  }

  // Virus! manages its own full-page layout
  if (currentGameType === 'VIRUS') {
    return (
      <VirusBoard
        virusState={gameState.board as VirusGameState}
        myPlayerId={myPlayerId}
        isMyTurn={isMyTurn}
        gameOver={gameOver}
        onAction={(move: VirusMove) => sendMove(move)}
        onLeave={leaveRoom}
        onRematch={requestRematch}
        rematchVotes={rematchVotes}
        playerCount={players.length}
      />
    )
  }

  let statusText = ''
  if (gameState.winner === 'DRAW') {
    statusText = "It's a draw!"
  } else if (gameState.winner === myPlayerId) {
    statusText = 'You win! 🎉'
  } else if (gameState.winner !== null) {
    statusText = 'You lose.'
  } else if (isMyTurn) {
    statusText = currentGameType === 'TIC_TAC_TOE'
      ? `Your turn (${mySymbol})`
      : 'Your turn'
  } else {
    statusText = 'Waiting for opponent…'
  }

  const statusColor =
    gameState.winner === myPlayerId ? '#2e7d32' :
    gameState.winner && gameState.winner !== 'DRAW' ? '#c62828' :
    '#333'

  const GAME_TITLES: Record<GameType, string> = {
    TIC_TAC_TOE: 'Tic-Tac-Toe',
    MANCALA:     'Mancala',
    SPLENDOR:    'Splendor',
    JAIPUR:      'Jaipur',
    VIRUS:       'Virus!',
  }

  function renderBoard() {
    if (currentGameType === 'TIC_TAC_TOE') {
      return (
        <TicTacToeGrid
          board={gameState!.board as string[]}
          isMyTurn={isMyTurn}
          gameOver={gameOver}
          onMove={(cell) => sendMove({ cell })}
        />
      )
    }
    if (currentGameType === 'MANCALA') {
      const names: [string, string] = [
        gameState!.players[0]?.name ?? 'Player 1',
        gameState!.players[1]?.name ?? 'Player 2',
      ]
      return (
        <MancalaBoard
          board={gameState!.board as number[]}
          isMyTurn={isMyTurn}
          gameOver={gameOver}
          myIndex={myIndex >= 0 ? myIndex : 0}
          winnerId={gameState!.winner}
          myPlayerId={myPlayerId}
          onMove={(pit) => sendMove({ pit })}
          playerNames={names}
          onLeave={leaveRoom}
          onRematch={requestRematch}
          rematchVotes={rematchVotes}
          playerCount={players.length}
          lastEvents={gameState!.events}
        />
      )
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>{GAME_TITLES[currentGameType]}</h2>
        <button style={styles.btnLeave} onClick={leaveRoom}>Leave room</button>
      </div>

      <p style={{ ...styles.status, color: statusColor }}>{statusText}</p>

      {renderBoard()}

      {/* Mancala has its own end-game overlay with rematch/leave actions */}
      {gameOver && currentGameType !== 'MANCALA' && (
        <div style={styles.rematchPanel}>
          {myPlayerId && rematchVotes.includes(myPlayerId) ? (
            <button style={styles.btnRematchWaiting} disabled>
              Waiting for opponent… ({rematchVotes.length}/{players.length})
            </button>
          ) : (
            <button style={styles.btnRematch} onClick={requestRematch}>
              Rematch
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page:               { maxWidth: 620, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' },
  header:             { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title:              { margin: 0 },
  roomId:             { color: '#555', margin: '4px 0 0' },
  playerList:         { background: '#f5f5f5', borderRadius: 8, padding: '16px 20px', marginTop: 24 },
  playersLabel:       { fontWeight: 600 },
  empty:              { color: '#aaa' },
  list:               { listStyle: 'none', padding: 0, margin: '8px 0 0' },
  playerItem:         { padding: '4px 0', fontSize: 15 },
  you:                { color: '#1a73e8', fontSize: 13 },
  hostBadge:          { color: '#f09c00', fontSize: 13, fontWeight: 600 },
  btnLeave:           { padding: '6px 14px', background: '#fff', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: 6, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnStart:           { marginTop: 24, width: '100%', padding: '10px 0', background: '#bdbdbd', color: '#fff', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontWeight: 600, opacity: 0.7, fontSize: 15 },
  btnStartActive:     { background: '#1a73e8', cursor: 'pointer', opacity: 1 },
  status:             { fontSize: 18, fontWeight: 600, margin: '16px 0', textAlign: 'center' },
  rematchPanel:       { marginTop: 24 },
  btnRematch:         { width: '100%', padding: '10px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 15 },
  btnRematchWaiting:  { width: '100%', padding: '10px 0', background: '#bdbdbd', color: '#fff', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontWeight: 600, fontSize: 15, opacity: 0.8 },
}

import type { Move } from '@gamengine/shared'
import { useSocket } from '../hooks/useSocket'

export function GameBoard() {
  const { socket, gameState, roomId } = useSocket()

  function sendMove(moveData: unknown) {
    if (!socket.id) return
    const move: Move = { type: 'play', playerId: socket.id, data: moveData }
    socket.emit('send_move', move, (ok, err) => {
      if (!ok) console.error('Move rejected:', err)
    })
  }

  if (!gameState) {
    return <p>Waiting for game to start… (room: {roomId})</p>
  }

  return (
    <div>
      <h2>Turn {gameState.turn}</h2>
      {gameState.winner && <h3>Winner: {gameState.winner}</h3>}
      <pre>{JSON.stringify(gameState.board, null, 2)}</pre>
      <button onClick={() => sendMove({ cell: 0 })}>Make move</button>
    </div>
  )
}

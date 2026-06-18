import { useSocket } from './hooks/useSocket'
import { Lobby } from './components/Lobby'
import { GameBoard } from './components/GameBoard'

export function App() {
  const { socket, gameState, roomId, players, hostId, leaveRoom } = useSocket()

  if (!roomId) return <Lobby socket={socket} />
  return (
    <GameBoard
      socket={socket}
      gameState={gameState}
      roomId={roomId}
      players={players}
      hostId={hostId}
      leaveRoom={leaveRoom}
    />
  )
}

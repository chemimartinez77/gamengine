import { useSocket } from './hooks/useSocket'
import { Lobby } from './components/Lobby'
import { GameBoard } from './components/GameBoard'

export function App() {
  const { socket, gameState, roomId, currentGameType, players, hostId, rematchVotes, leaveRoom, startGame, requestRematch } = useSocket()

  if (!roomId) return <Lobby socket={socket} />
  return (
    <GameBoard
      socket={socket}
      gameState={gameState}
      roomId={roomId}
      currentGameType={currentGameType}
      players={players}
      hostId={hostId}
      rematchVotes={rematchVotes}
      leaveRoom={leaveRoom}
      startGame={startGame}
      requestRematch={requestRematch}
    />
  )
}

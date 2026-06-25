import { useSocket } from './hooks/useSocket'
import { Lobby } from './components/Lobby'
import { GameBoard } from './components/GameBoard'
import { SplendorCuration } from './components/games/splendor/SplendorCuration'

export function App() {
  if (window.location.pathname === '/splendor-curation') {
    return <SplendorCuration />
  }

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

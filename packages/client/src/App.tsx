import { useSocket } from './hooks/useSocket'
import { Lobby } from './components/Lobby'
import { GameBoard } from './components/GameBoard'

export function App() {
  const { gameState, roomId } = useSocket()

  if (!roomId) return <Lobby />
  return <GameBoard />
}

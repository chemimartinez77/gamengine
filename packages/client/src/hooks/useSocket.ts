import { useState, useEffect } from 'react'
import type { GameState } from '@gamengine/shared'
import { useSocketContext } from '../context/SocketContext'

export function useSocket() {
  const socket = useSocketContext()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [roomId, setRoomId]       = useState<string | null>(null)

  useEffect(() => {
    const handleGameStarted  = (state: GameState) => setGameState(state)
    const handleStateUpdated = (state: GameState) => setGameState(state)
    const handleRoomJoined   = (id: string, initialState: GameState | null) => {
      setRoomId(id)
      if (initialState) setGameState(initialState)
    }

    socket.on('game_started',  handleGameStarted)
    socket.on('state_updated', handleStateUpdated)
    socket.on('room_joined',   handleRoomJoined)

    return () => {
      socket.off('game_started',  handleGameStarted)
      socket.off('state_updated', handleStateUpdated)
      socket.off('room_joined',   handleRoomJoined)
    }
  }, [socket])

  return { socket, gameState, roomId }
}

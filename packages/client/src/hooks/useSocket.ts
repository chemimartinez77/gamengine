import { useState, useEffect, useCallback } from 'react'
import type { GameState, GameType, Player } from '@gamengine/shared'
import { useSocketContext } from '../context/SocketContext'

export function useSocket() {
  const socket                          = useSocketContext()
  const [gameState, setGameState]             = useState<GameState | null>(null)
  const [roomId, setRoomId]                   = useState<string | null>(null)
  const [players, setPlayers]                 = useState<Player[]>([])
  const [hostId, setHostId]                   = useState<string | null>(null)
  const [rematchVotes, setRematchVotes]       = useState<string[]>([])
  const [currentGameType, setCurrentGameType] = useState<GameType>('TIC_TAC_TOE')

  useEffect(() => {
    const handleRoomJoined = (id: string, initialState: GameState | null, gameType: GameType) => {
      setRoomId(id)
      setCurrentGameType(gameType)
      if (initialState) {
        setGameState(initialState)
        setPlayers(initialState.players)
      }
    }

    const handlePlayerJoined = (player: Player) => {
      setPlayers((prev) => {
        if (prev.some((p) => p.id === player.id)) return prev
        return [...prev, player]
      })
      // First player_joined after room_joined with no hostId → that player is the host
      setHostId((prev) => prev ?? player.id)
    }

    const handlePlayerLeft = (playerId: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    }

    const handleHostChanged = (newHostId: string) => {
      setHostId(newHostId)
    }

    const handleGameStarted = (state: GameState) => {
      setGameState(state)
      setPlayers(state.players)
      setRematchVotes([])
    }

    const handleRematchRequested = (playerId: string) => {
      setRematchVotes((prev) => prev.includes(playerId) ? prev : [...prev, playerId])
    }

    const handleStateUpdated = (state: GameState) => {
      setGameState(state)
    }

    socket.on('room_joined',    handleRoomJoined)
    socket.on('player_joined',  handlePlayerJoined)
    socket.on('player_left',    handlePlayerLeft)
    socket.on('host_changed',   handleHostChanged)
    socket.on('game_started',       handleGameStarted)
    socket.on('state_updated',      handleStateUpdated)
    socket.on('rematch_requested',  handleRematchRequested)

    return () => {
      socket.off('room_joined',       handleRoomJoined)
      socket.off('player_joined',     handlePlayerJoined)
      socket.off('player_left',       handlePlayerLeft)
      socket.off('host_changed',      handleHostChanged)
      socket.off('game_started',      handleGameStarted)
      socket.off('state_updated',     handleStateUpdated)
      socket.off('rematch_requested', handleRematchRequested)
    }
  }, [socket])

  const leaveRoom = useCallback(() => {
    socket.emit('leave_room', () => {
      setRoomId(null)
      setGameState(null)
      setPlayers([])
      setHostId(null)
    })
  }, [socket])

  const startGame = useCallback(() => {
    socket.emit('start_game', (ok, err) => {
      if (!ok) console.error('start_game rejected:', err)
    })
  }, [socket])

  const requestRematch = useCallback(() => {
    const myId = socket.id
    if (myId) setRematchVotes((prev) => prev.includes(myId) ? prev : [...prev, myId])
    socket.emit('request_rematch', (ok, err) => {
      if (!ok) console.error('request_rematch rejected:', err)
    })
  }, [socket])

  return { socket, gameState, roomId, currentGameType, players, hostId, rematchVotes, leaveRoom, startGame, requestRematch }
}

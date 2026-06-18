import { useState } from 'react'
import type { Player } from '@gamengine/shared'
import { useSocket } from '../hooks/useSocket'

export function Lobby() {
  const { socket } = useSocket()
  const [name, setName]     = useState('')
  const [joinId, setJoinId] = useState('')
  const [error, setError]   = useState<string | null>(null)

  const player: Player = { id: socket.id ?? crypto.randomUUID(), name }

  function handleCreate() {
    if (!name.trim()) return
    socket.emit('create_room', player, (roomId) => {
      console.log('Room created:', roomId)
    })
  }

  function handleJoin() {
    if (!name.trim() || !joinId.trim()) return
    socket.emit('join_room', joinId.trim(), player, (ok, err) => {
      if (!ok) setError(err ?? 'Unknown error')
    })
  }

  return (
    <div>
      <h1>Gamengine Lobby</h1>
      <input
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={handleCreate}>Create room</button>
      <hr />
      <input
        placeholder="Room ID"
        value={joinId}
        onChange={(e) => setJoinId(e.target.value)}
      />
      <button onClick={handleJoin}>Join room</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

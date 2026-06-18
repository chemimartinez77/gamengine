import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@gamengine/shared'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const SocketContext = createContext<AppSocket | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<AppSocket | null>(null)

  if (!socketRef.current) {
    socketRef.current = io({ transports: ['websocket'] })
  }

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={socketRef.current}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocketContext(): AppSocket {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocketContext must be used inside SocketProvider')
  return ctx
}

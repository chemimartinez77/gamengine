import { createContext, useContext, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@gamengine/shared'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const socket: AppSocket = io('http://localhost:3000', {
  transports: ['websocket'],
  withCredentials: true,
  autoConnect: true,
})

const SocketContext = createContext<AppSocket>(socket)

export function SocketProvider({ children }: { children: ReactNode }) {
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

export function useSocketContext(): AppSocket {
  return useContext(SocketContext)
}

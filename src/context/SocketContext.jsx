import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"
import { io } from "socket.io-client"

// One Socket.IO connection per logged-in session, shared by every component.
// It connects when a token appears, reconnects on its own, and disconnects on
// logout. Components subscribe with useSocketEvent().
const SocketContext = createContext({ socket: null, connected: false })

export function SocketProvider({ children }) {
  const { token } = useSelector((state) => state.auth)
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!token || !process.env.REACT_APP_BASE_URL) {
      setSocket(null)
      setConnected(false)
      return undefined
    }
    const s = io(process.env.REACT_APP_BASE_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 10000,
    })
    s.on("connect", () => setConnected(true))
    s.on("disconnect", () => setConnected(false))
    // An expired or revoked session cannot connect; stop retrying with it.
    s.on("connect_error", (error) => {
      if (/token|session|User not found|deactivated/i.test(error.message)) s.disconnect()
    })
    setSocket(s)
    return () => {
      s.removeAllListeners()
      s.disconnect()
    }
  }, [token])

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
}

export function useSocket() {
  return useContext(SocketContext)
}

// Subscribes `handler` to `event` for as long as the component is mounted. The
// latest handler is always used, so it may close over fresh state.
export function useSocketEvent(event, handler) {
  const { socket } = useSocket()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!socket) return undefined
    const listener = (...args) => ref.current(...args)
    socket.on(event, listener)
    return () => socket.off(event, listener)
  }, [socket, event])
}

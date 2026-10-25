import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"
import { io } from "socket.io-client"
import { refreshSession } from "../services/apiConnector"

// One Socket.IO connection per logged-in session, shared by every component.
// It connects when a token appears, reconnects on its own, and disconnects on
// logout. Components subscribe with useSocketEvent().
const SocketContext = createContext({ socket: null, connected: false })

export function SocketProvider({ children }) {
  const { token } = useSelector((state) => state.auth)
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  // Access tokens are refreshed every few minutes; the socket reads the latest
  // one whenever it (re)connects instead of being torn down on each refresh.
  const tokenRef = useRef(token)
  tokenRef.current = token
  const loggedIn = Boolean(token)

  useEffect(() => {
    if (!loggedIn || !process.env.REACT_APP_BASE_URL) {
      setSocket(null)
      setConnected(false)
      return undefined
    }
    const s = io(process.env.REACT_APP_BASE_URL, {
      auth: (cb) => cb({ token: tokenRef.current }),
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 10000,
    })
    s.on("connect", () => setConnected(true))
    s.on("disconnect", () => setConnected(false))
    // An expired access token is refreshed by the next API call; retry a few
    // times before giving up on a session that is really over.
    let authFailures = 0
    s.on("connect", () => (authFailures = 0))
    s.on("connect_error", (error) => {
      if (!/token|session|User not found|deactivated/i.test(error.message)) return
      if (++authFailures >= 5) return s.disconnect()
      // Usually just an expired access token: refresh it; the next attempt
      // picks up the new one.
      refreshSession().catch(() => {})
    })
    setSocket(s)
    return () => {
      s.removeAllListeners()
      s.disconnect()
    }
  }, [loggedIn])

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

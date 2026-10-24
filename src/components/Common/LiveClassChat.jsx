import { Send, Users } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"

import { useSocket, useSocketEvent } from "../../context/SocketContext"

// Real-time chat for one live class (Socket.IO room `liveclass:<id>`). The
// server checks that the viewer belongs to the course, keeps the last 50
// messages for late joiners, and rate-limits senders.
export default function LiveClassChat({ liveClassId }) {
  const { socket, connected } = useSocket()
  const { user } = useSelector((state) => state.profile)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [present, setPresent] = useState(0)
  const [joined, setJoined] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (!socket || !connected) return undefined
    socket.emit("liveclass:join", { liveClassId }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Could not join the chat")
        return
      }
      setJoined(true)
      setError("")
      setMessages(res.history || [])
    })
    return () => {
      socket.emit("liveclass:leave", { liveClassId })
      setJoined(false)
    }
  }, [socket, connected, liveClassId])

  useSocketEvent("liveclass:message", (message) => {
    if (message.liveClassId !== liveClassId) return
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
  })
  useSocketEvent("presence", ({ room, count }) => {
    if (room === `liveclass:${liveClassId}`) setPresent(count)
  })

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const send = (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !socket) return
    socket.emit("liveclass:message", { liveClassId, text }, (res) => {
      if (res?.ok) {
        setDraft("")
        setError("")
      } else {
        setError(res?.error || "Message not sent")
      }
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-richblack-700 bg-richblack-900">
      <div className="flex items-center justify-between border-b border-richblack-700 px-4 py-2 text-sm">
        <span className="font-semibold text-richblack-5">Class chat</span>
        <span className="flex items-center gap-1 text-richblack-300">
          <span className={`h-2 w-2 rounded-full ${connected && joined ? "bg-caribbeangreen-100" : "bg-richblack-500"}`} />
          <Users size={14} /> {present} here
        </span>
      </div>
      <div ref={listRef} className="flex h-56 flex-col gap-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <p className="m-auto text-richblack-400">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.user.id === user?._id
            return (
              <div key={m.id} className={`max-w-[85%] ${mine ? "self-end text-right" : "self-start"}`}>
                <p className="text-xs text-richblack-300">
                  {mine ? "You" : m.user.name}
                  {m.user.accountType === "Instructor" && <span className="ml-1 text-yellow-50">(Instructor)</span>}
                  {" · "}
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p
                  className={`mt-0.5 inline-block rounded-2xl px-3 py-1.5 ${
                    mine ? "bg-yellow-50 text-richblack-900" : "bg-richblack-700 text-richblack-5"
                  }`}
                >
                  {m.text}
                </p>
              </div>
            )
          })
        )}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-richblack-700 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          disabled={!joined}
          placeholder={joined ? "Type a message..." : "Connecting..."}
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-yellow-50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!joined || !draft.trim()}
          aria-label="Send message"
          className="grid h-9 w-9 place-items-center rounded-lg bg-yellow-50 text-richblack-900 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
      {error && <p className="px-4 pb-2 text-xs text-pink-200">{error}</p>}
    </div>
  )
}

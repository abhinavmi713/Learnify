const { Server } = require("socket.io")
const { createAdapter } = require("@socket.io/redis-adapter")
const { Emitter } = require("@socket.io/redis-emitter")
const Redis = require("ioredis")
const { v4: uuidv4 } = require("uuid")

const logger = require("../utils/logger")
const { verifyAccessToken } = require("../middleware/auth")
const { lectureAccess, liveClassAccess } = require("../utils/access")
const { take } = require("../utils/tokenBucket")
const { getRedis, rawRedis } = require("../config/redis")

// Real-time layer (Socket.IO).
//
// Rooms
//   user:<id>            every socket of one user (notifications)
//   lecture:<subId>      everyone viewing one lecture (live Q&A, "N watching")
//   liveclass:<id>       chat for one live class
//
// Auth: the handshake carries the same JWT as HTTP and is verified by the same
// function (verifyAccessToken), so revoked/expired/deactivated sessions cannot
// open a socket. Joining a lecture or live-class room is authorised per room:
// only enrolled students, the course instructor and admins.
//
// Scaling: with Redis configured the Redis adapter relays emits between API
// instances, so a user connected to instance A receives an event emitted on
// instance B. Processes that do not run a socket server (the worker) can still
// emit through Redis with the emitter.
let io = null
let emitter = null
let adapterClients = []

const CHAT_HISTORY = 50
const chatMemory = new Map() // liveClassId -> messages, used without Redis

const corsOrigins = () =>
  (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((o) => o.trim())

async function publishPresence(room) {
  if (!io) return
  try {
    const sockets = await io.in(room).fetchSockets()
    const users = new Set(sockets.map((s) => s.data.user?.id))
    io.to(room).emit("presence", { room, count: users.size })
  } catch (error) {
    // Presence is a nicety; never let it break anything.
  }
}

async function chatHistory(liveClassId) {
  const redis = getRedis()
  if (redis) {
    try {
      const raw = await redis.lrange(`chat:liveclass:${liveClassId}`, 0, CHAT_HISTORY - 1)
      return raw.map((m) => JSON.parse(m)).reverse()
    } catch (error) {
      /* fall back to memory */
    }
  }
  return chatMemory.get(liveClassId) || []
}

async function saveChatMessage(liveClassId, message) {
  const redis = getRedis()
  if (redis) {
    try {
      const key = `chat:liveclass:${liveClassId}`
      await redis.multi().lpush(key, JSON.stringify(message)).ltrim(key, 0, CHAT_HISTORY - 1).expire(key, 2 * 24 * 3600).exec()
      return
    } catch (error) {
      /* fall back to memory */
    }
  }
  const list = chatMemory.get(liveClassId) || []
  list.push(message)
  chatMemory.set(liveClassId, list.slice(-CHAT_HISTORY))
}

function registerHandlers(socket) {
  const user = socket.data.user
  socket.join(`user:${user.id}`)

  // Switch the socket to one lecture room at a time.
  socket.on("lecture:join", async ({ subsectionId } = {}, ack = () => {}) => {
    const course = await lectureAccess(user, subsectionId).catch(() => null)
    if (!course) return ack({ ok: false, error: "Not allowed to join this lecture" })
    for (const room of socket.rooms) {
      if (room.startsWith("lecture:") && room !== `lecture:${subsectionId}`) {
        socket.leave(room)
        publishPresence(room)
      }
    }
    socket.join(`lecture:${subsectionId}`)
    ack({ ok: true })
    publishPresence(`lecture:${subsectionId}`)
  })

  socket.on("lecture:leave", ({ subsectionId } = {}) => {
    socket.leave(`lecture:${subsectionId}`)
    publishPresence(`lecture:${subsectionId}`)
  })

  socket.on("liveclass:join", async ({ liveClassId } = {}, ack = () => {}) => {
    const liveClass = await liveClassAccess(user, liveClassId).catch(() => null)
    if (!liveClass) return ack({ ok: false, error: "Not allowed to join this live class" })
    socket.join(`liveclass:${liveClassId}`)
    ack({ ok: true, history: await chatHistory(liveClassId) })
    publishPresence(`liveclass:${liveClassId}`)
  })

  socket.on("liveclass:leave", ({ liveClassId } = {}) => {
    socket.leave(`liveclass:${liveClassId}`)
    publishPresence(`liveclass:${liveClassId}`)
  })

  socket.on("liveclass:message", async ({ liveClassId, text } = {}, ack = () => {}) => {
    const room = `liveclass:${liveClassId}`
    if (!socket.rooms.has(room)) return ack({ ok: false, error: "Join the live class first" })
    const body = typeof text === "string" ? text.trim() : ""
    if (!body || body.length > 500) return ack({ ok: false, error: "Message must be 1-500 characters" })

    // Same token bucket as the HTTP limits: short bursts are fine, spam is not.
    const limit = await take(`chat:${user.id}`, { capacity: 5, refillPerSec: 1 })
    if (!limit.allowed) return ack({ ok: false, error: "You are sending messages too fast" })

    const message = {
      id: uuidv4(),
      liveClassId,
      text: body,
      at: new Date().toISOString(),
      user: { id: user.id, name: user.name, accountType: user.accountType },
    }
    await saveChatMessage(liveClassId, message)
    io.to(room).emit("liveclass:message", message)
    ack({ ok: true, message })
  })

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms].filter((r) => r.startsWith("lecture:") || r.startsWith("liveclass:"))
    // After the socket has actually left.
    setImmediate(() => rooms.forEach(publishPresence))
  })
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins(), credentials: true },
    // Recover briefly-dropped connections (mobile networks) without losing events.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  })

  if (process.env.REDIS_URL) {
    const pub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    const sub = pub.duplicate()
    pub.on("error", () => {})
    sub.on("error", () => {})
    adapterClients = [pub, sub]
    io.adapter(createAdapter(pub, sub))
    logger.info("socket.io using the redis adapter")
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      const { user } = await verifyAccessToken(token)
      socket.data.user = {
        id: String(user._id),
        name: `${user.firstName} ${user.lastName}`,
        accountType: user.accountType,
      }
      next()
    } catch (error) {
      next(new Error(error.message || "unauthorized"))
    }
  })

  io.on("connection", registerHandlers)
  return io
}

// Emits through the local server when this process runs one, otherwise through
// Redis (worker process), otherwise drops the event (nobody can be listening).
function target() {
  if (io) return io
  if (!emitter && rawRedis()) emitter = new Emitter(rawRedis())
  return emitter
}

function emitToUser(userId, event, payload) {
  const t = target()
  if (t) t.to(`user:${userId}`).emit(event, payload)
}

function emitToRoom(room, event, payload) {
  const t = target()
  if (t) t.to(room).emit(event, payload)
}

async function closeRealtime() {
  if (io) await new Promise((resolve) => io.close(() => resolve()))
  io = null
  for (const client of adapterClients) client.disconnect()
  adapterClients = []
}

function getIO() {
  return io
}

module.exports = { initRealtime, emitToUser, emitToRoom, closeRealtime, getIO }

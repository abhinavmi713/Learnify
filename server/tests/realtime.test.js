const http = require("http")
const jwt = require("jsonwebtoken")
const request = require("supertest")
const { io: connectClient } = require("socket.io-client")

const app = require("../app")
const { initRealtime, closeRealtime } = require("../realtime")
const { notifyUser } = require("../utils/notify")
const { revokeToken } = require("../utils/tokenRevocation")
const Course = require("../models/Course")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const LiveClass = require("../models/LiveClass")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

let server
let url
const clients = []

beforeAll(async () => {
  await startTestDb()
  server = http.createServer(app)
  initRealtime(server)
  await new Promise((resolve) => server.listen(0, resolve))
  url = `http://127.0.0.1:${server.address().port}`
}, 120000)

afterAll(async () => {
  await closeRealtime()
  await new Promise((resolve) => server.close(resolve))
  await stopTestDb()
})

afterEach(async () => {
  while (clients.length) clients.pop().disconnect()
  await clearTestDb()
})

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false })
    clients.push(socket)
    socket.on("connect", () => resolve(socket))
    socket.on("connect_error", (error) => reject(error))
  })
}

const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve))

function nextEvent(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms}ms`)), ms)
    socket.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function noEvent(socket, event, ms = 400) {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`))
    socket.once(event, handler)
    setTimeout(() => {
      socket.off(event, handler)
      resolve()
    }, ms)
  })
}

async function world() {
  const instructor = await createUser({ email: "inst@example.com", accountType: "Instructor" })
  const student = await createUser({ email: "stud@example.com", accountType: "Student" })
  const outsider = await createUser({ email: "out@example.com", accountType: "Student" })
  const lecture = await SubSection.create({ title: "L1", description: "d", videoUrl: "http://x/v.mp4", timeDuration: "10" })
  const section = await Section.create({ sectionName: "S1", subSection: [lecture._id] })
  const course = await Course.create({
    courseName: "Realtime 101",
    courseDescription: "d",
    instructor: instructor._id,
    whatYouWillLearn: "w",
    price: 0,
    tag: ["t"],
    thumbnail: "http://x/t.jpg",
    instructions: ["i"],
    status: "Published",
    courseContent: [section._id],
    studentsEnroled: [student._id],
  })
  const liveClass = await LiveClass.create({
    course: course._id,
    title: "Office hours",
    meetingLink: "https://meet.example.com/x",
    scheduledAt: new Date(Date.now() + 3600000),
  })
  return { instructor, student, outsider, lecture, section, course, liveClass }
}

describe("handshake authentication", () => {
  test("rejects a missing or forged token", async () => {
    await expect(connect(undefined)).rejects.toThrow(/Token Missing/)
    await expect(connect("not-a-jwt")).rejects.toThrow(/invalid/)
  })

  test("rejects a token that was logged out", async () => {
    const { student } = await world()
    const token = jwt.sign({ id: String(student._id), jti: "sess-1" }, process.env.JWT_SECRET, { expiresIn: "1h" })
    await revokeToken(jwt.decode(token))
    await expect(connect(token)).rejects.toThrow(/Session ended/)
  })

  test("accepts a valid session", async () => {
    const { student } = await world()
    const socket = await connect(tokenFor(student))
    expect(socket.connected).toBe(true)
  })
})

describe("live notifications", () => {
  test("notifyUser pushes to every open tab of that user only", async () => {
    const { student, outsider } = await world()
    const tabA = await connect(tokenFor(student))
    const tabB = await connect(tokenFor(student))
    const other = await connect(tokenFor(outsider))

    const received = Promise.all([nextEvent(tabA, "notification:new"), nextEvent(tabB, "notification:new")])
    const silent = noEvent(other, "notification:new")
    await notifyUser(student._id, "Your course was approved", "/dashboard")
    const [a, b] = await received
    await silent
    expect(a.message).toBe("Your course was approved")
    expect(b._id).toBe(a._id)
  })
})

describe("lecture rooms and live Q&A", () => {
  test("only participants can join a lecture room", async () => {
    const { student, outsider, instructor, lecture } = await world()
    const s = await connect(tokenFor(student))
    const o = await connect(tokenFor(outsider))
    const i = await connect(tokenFor(instructor))
    expect((await emitAck(s, "lecture:join", { subsectionId: String(lecture._id) })).ok).toBe(true)
    expect((await emitAck(i, "lecture:join", { subsectionId: String(lecture._id) })).ok).toBe(true)
    expect((await emitAck(o, "lecture:join", { subsectionId: String(lecture._id) })).ok).toBe(false)
    expect((await emitAck(s, "lecture:join", { subsectionId: "nonsense" })).ok).toBe(false)
  })

  test("a question posted over HTTP appears live for everyone in the lecture room", async () => {
    const { student, instructor, outsider, lecture, course, section } = await world()
    const s = await connect(tokenFor(student))
    const o = await connect(tokenFor(outsider))
    await emitAck(s, "lecture:join", { subsectionId: String(lecture._id) })

    const live = nextEvent(s, "discussion:new")
    const silent = noEvent(o, "discussion:new")
    const res = await request(app)
      .post("/api/v1/discussion/create")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({ courseId: String(course._id), sectionId: String(section._id), subsectionId: String(lecture._id), text: "Welcome! Ask anything." })
    expect(res.status).toBe(201)
    const pushed = await live
    await silent
    expect(pushed.text).toBe("Welcome! Ask anything.")
    expect(pushed.user.accountType).toBe("Instructor")

    const deleted = nextEvent(s, "discussion:deleted")
    await request(app)
      .post("/api/v1/discussion/delete")
      .set("Authorization", `Bearer ${tokenFor(instructor)}`)
      .send({ discussionId: res.body.data._id })
    expect((await deleted).id).toBe(res.body.data._id)
  })

  test("reading a lecture's discussion now requires access to the course", async () => {
    const { student, outsider, lecture } = await world()
    const get = (u) =>
      request(app).get(`/api/v1/discussion/subsection?subsectionId=${lecture._id}`).set("Authorization", `Bearer ${tokenFor(u)}`)
    expect((await get(student)).status).toBe(200)
    expect((await get(outsider)).status).toBe(403)
  })

  test("presence counts distinct users in the room", async () => {
    const { student, instructor, lecture } = await world()
    const s = await connect(tokenFor(student))
    const i = await connect(tokenFor(instructor))
    await emitAck(s, "lecture:join", { subsectionId: String(lecture._id) })
    const update = nextEvent(s, "presence")
    await emitAck(i, "lecture:join", { subsectionId: String(lecture._id) })
    expect((await update).count).toBe(2)

    const afterLeave = nextEvent(s, "presence")
    i.disconnect()
    expect((await afterLeave).count).toBe(1)
  })
})

describe("live-class chat", () => {
  test("participants exchange messages; late joiners get history; validation applies", async () => {
    const { student, instructor, outsider, liveClass } = await world()
    const id = String(liveClass._id)
    const s = await connect(tokenFor(student))
    const i = await connect(tokenFor(instructor))
    const o = await connect(tokenFor(outsider))

    expect((await emitAck(o, "liveclass:join", { liveClassId: id })).ok).toBe(false)
    expect((await emitAck(o, "liveclass:message", { liveClassId: id, text: "let me in" })).ok).toBe(false)

    expect((await emitAck(i, "liveclass:join", { liveClassId: id })).ok).toBe(true)
    const join = await emitAck(s, "liveclass:join", { liveClassId: id })
    expect(join.ok).toBe(true)
    expect(join.history).toEqual([])

    const incoming = nextEvent(i, "liveclass:message")
    expect((await emitAck(s, "liveclass:message", { liveClassId: id, text: "  Hello class  " })).ok).toBe(true)
    const msg = await incoming
    expect(msg.text).toBe("Hello class")
    expect(msg.user.name).toMatch(/Test Student/)

    expect((await emitAck(s, "liveclass:message", { liveClassId: id, text: "   " })).ok).toBe(false)
    expect((await emitAck(s, "liveclass:message", { liveClassId: id, text: "x".repeat(501) })).ok).toBe(false)

    const late = await connect(tokenFor(instructor))
    const history = await emitAck(late, "liveclass:join", { liveClassId: id })
    expect(history.history.map((m) => m.text)).toEqual(["Hello class"])
  })
})

// Regression tests for the second round of fixes (bugs found while writing
// Topics 11 to 26). Each test is named after its bug id.
process.env.ENCRYPTION_KEY = "ab".repeat(32)
process.env.RAZORPAY_SECRET = "test_razorpay_secret"
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret"

jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))
jest.mock("../utils/imageUploader", () => ({
  uploadImageToCloudinary: jest.fn().mockResolvedValue({ secure_url: "https://example.com/image.png" }),
}))
const mockOrders = { create: jest.fn(), fetch: jest.fn() }
const mockPayments = { refund: jest.fn(), fetchMultipleRefund: jest.fn() }
jest.mock("../config/razorpay", () => ({ getInstance: () => ({ orders: mockOrders, payments: mockPayments }) }))

const crypto = require("crypto")
const dns = require("dns")
const http = require("http")
const fs = require("fs")
const path = require("path")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const request = require("supertest")
const { io: connectClient } = require("socket.io-client")

const app = require("../app")
const mongoose = require("mongoose")
const AuditLog = require("../models/AuditLog")
const Category = require("../models/Category")
const Coupon = require("../models/Coupon")
const Course = require("../models/Course")
const OutboxEvent = require("../models/OutboxEvent")
const PaymentRecord = require("../models/PaymentRecord")
const RefreshToken = require("../models/RefreshToken")
const User = require("../models/User")
const Webhook = require("../models/Webhook")
const WebhookDelivery = require("../models/WebhookDelivery")
const mailSender = require("../utils/mailSender")
const secretBox = require("../utils/secretBox")
const totp = require("../utils/totp")
const relay = require("../events/relay")
const { enqueueEvent } = require("../events/outbox")
const { isPrivateAddress, resolveDeliverableUrl, deliver, webhookSecretContext } = require("../utils/webhooks")
const { handleRefund } = require("../workers/handlers/refund")
const { hashPassword, verifyPassword } = require("../utils/password")
const { take, sweepLocalBuckets, resetLocalBuckets } = require("../utils/tokenBucket")
const { initRealtime, closeRealtime } = require("../realtime")
const { register } = require("../utils/metrics")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)
afterAll(async () => {
  await stopTestDb()
})
afterEach(async () => {
  jest.restoreAllMocks()
  await clearTestDb()
  Object.values(mockOrders).forEach((m) => m.mockReset())
  Object.values(mockPayments).forEach((m) => m.mockReset())
  mailSender.mockClear()
  delete process.env.ALLOW_PRIVATE_WEBHOOK_URLS
})

const bearer = (token) => ({ Authorization: `Bearer ${token}` })
const auth = (user) => bearer(tokenFor(user))
const XHR = { "X-Requested-With": "XMLHttpRequest" }
const hmac = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex")
let n = 0
const student = (overrides = {}) => createUser({ email: `s${++n}@example.com`, ...overrides })
const instructor = () => createUser({ email: `i${++n}@example.com`, accountType: "Instructor" })
const admin = () => createUser({ email: `a${++n}@example.com`, accountType: "Admin" })
const course = (owner, overrides = {}) =>
  Course.create({ courseName: `Course ${++n}`, courseDescription: "d", instructor: owner._id, whatYouWillLearn: "w", price: 500, tag: ["t"], thumbnail: "http://example.com/t.jpg", instructions: ["x"], status: "Published", ...overrides })
const login = (email, password = "Password123", headers = {}) => request(app).post("/api/v1/auth/login").set(headers).send({ email, password })
const cookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("refreshToken=")).split(";")[0]
const server = (handler) =>
  new Promise((resolve) => {
    const s = http.createServer(handler)
    s.listen(0, "127.0.0.1", () => resolve(s))
  })
async function hook(owner, url) {
  return Webhook.create({ owner: owner._id, url, events: ["review.created"], secret: secretBox.seal("whsec_test", webhookSecretContext(owner._id)) })
}

describe("H12: every way of writing an internal address is refused", () => {
  test.each([
    ["::ffff:7f00:1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:a9fe:a9fe", true],
    ["::ffff:a00:5", true],
    ["64:ff9b::7f00:1", true],
    ["::7f00:1", true],
    ["2002:7f00:1::", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::1", true],
    ["not-an-ip::zz", true],
    ["93.184.216.34", false],
    ["2606:4700:4700::1111", false],
    ["::ffff:5db8:d822", false],
  ])("%s private: %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })

  test("the URL check refuses the bypasses that used to pass", async () => {
    for (const url of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/latest/", "http://[::ffff:10.0.0.5]/", "http://[64:ff9b::7f00:1]/"]) {
      await expect(resolveDeliverableUrl(url)).rejects.toThrow(/private or internal/)
    }
  })
})

describe("H13 and L47: delivery connects to the checked address and reads little", () => {
  test("the connection uses the address from the check, not a second lookup", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1"
    let hits = 0
    const s = await server((req, res) => {
      hits++
      res.end("ok")
    })
    const realPromise = dns.promises.lookup
    const realLookup = dns.lookup
    dns.promises.lookup = async (host, opts) => (host === "rebind.example" ? [{ address: "127.0.0.1", family: 4 }] : realPromise(host, opts))
    // A second lookup would get an unreachable address.
    dns.lookup = (host, opts, cb) => {
      if (typeof opts === "function") [cb, opts] = [opts, {}]
      if (host === "rebind.example") return opts?.all ? cb(null, [{ address: "203.0.113.1", family: 4 }]) : cb(null, "203.0.113.1", 4)
      return realLookup(host, opts, cb)
    }
    try {
      const owner = await instructor()
      const h = await hook(owner, `http://rebind.example:${s.address().port}/hook`)
      const d = await WebhookDelivery.create({ webhook: h._id, owner: owner._id, event: "ping", payload: {} })
      const result = await deliver(String(d._id))
      expect(result.ok).toBe(true)
      expect(hits).toBe(1)
    } finally {
      dns.promises.lookup = realPromise
      dns.lookup = realLookup
      s.close()
    }
  })

  test("a huge response is cut off", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1"
    const s = await server((req, res) => {
      res.writeHead(200)
      const chunk = "x".repeat(64 * 1024)
      let sent = 0
      const pump = () => {
        while (sent < 200 && res.write(chunk)) sent++
        if (sent < 200) res.once("drain", pump)
        else res.end()
      }
      pump()
    })
    try {
      const owner = await instructor()
      const h = await hook(owner, `http://127.0.0.1:${s.address().port}/hook`)
      const d = await WebhookDelivery.create({ webhook: h._id, owner: owner._id, event: "ping", payload: {} })
      const started = Date.now()
      await deliver(String(d._id))
      const saved = await WebhookDelivery.findById(d._id)
      expect(saved.status).toBe("succeeded")
      expect(saved.responseBody.length).toBeLessThanOrEqual(500)
      expect(Date.now() - started).toBeLessThan(3000)
    } finally {
      s.close()
    }
  })
})

describe("M38: a refund event delivered twice at once refunds once", () => {
  test("partial refunds", async () => {
    const buyer = await student()
    await PaymentRecord.create({ orderId: "o1", paymentId: "p1", user: buyer._id, courses: [], amount: 500, chargedAmount: 1000, source: "verify", partialRefund: { amount: 500, status: "pending" } })
    mockPayments.fetchMultipleRefund.mockResolvedValue({ items: [] })
    mockPayments.refund.mockImplementation(() => new Promise((r) => setTimeout(() => r({ id: "rfnd" }), 50)))
    const payload = { orderId: "o1", paymentId: "p1", amount: 500, partial: true }
    const results = await Promise.allSettled([handleRefund({ payload }), handleRefund({ payload })])
    expect(mockPayments.refund).toHaveBeenCalledTimes(1)
    expect(results.filter((r) => r.status === "rejected").every((r) => /being processed/.test(r.reason.message))).toBe(true)
    expect((await PaymentRecord.findOne({ orderId: "o1" })).partialRefund.status).toBe("refunded")
  })

  test("full refunds", async () => {
    const buyer = await student()
    await PaymentRecord.create({ orderId: "o2", paymentId: "p2", user: buyer._id, courses: [], amount: 700, source: "verify", status: "refund_pending" })
    mockPayments.refund.mockImplementation(() => new Promise((r) => setTimeout(() => r({ id: "rfnd" }), 50)))
    const payload = { orderId: "o2", paymentId: "p2", amount: 700 }
    await Promise.allSettled([handleRefund({ payload }), handleRefund({ payload })])
    expect(mockPayments.refund).toHaveBeenCalledTimes(1)
    expect((await PaymentRecord.findOne({ orderId: "o2" })).status).toBe("refunded")
  })
})

describe("M37: events the relay gives up on are counted", () => {
  test("a metric reports failed events", async () => {
    await OutboxEvent.create({ eventId: "e-failed", type: "contact.submitted", payload: {}, status: "failed" })
    const text = await register.getSingleMetricAsString("learnify_outbox_failed_events")
    expect(text).toMatch(/learnify_outbox_failed_events 1/)
  })
})

describe("M41 and L46: the relay without RabbitMQ", () => {
  test("a hanging webhook doesn't delay a signup code", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1"
    const hang = await server(() => {})
    try {
      const owner = await instructor()
      const h = await hook(owner, `http://127.0.0.1:${hang.address().port}/hook`)
      for (let i = 0; i < 4; i++) {
        const d = await WebhookDelivery.create({ webhook: h._id, owner: owner._id, event: "ping", payload: {} })
        await enqueueEvent("webhook.delivery_requested", { deliveryId: String(d._id) })
      }
      await enqueueEvent("otp.requested", { email: "waiting@example.com", otp: "123456" })
      let sentAt = null
      mailSender.mockImplementation(async (to) => {
        if (to === "waiting@example.com") sentAt = Date.now()
        return {}
      })
      const started = Date.now()
      await relay.drain()
      expect(sentAt).not.toBeNull()
      expect(sentAt - started).toBeLessThan(2000)
    } finally {
      hang.close()
    }
  }, 30000)

  test("the final attempt marks a webhook delivery failed", async () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1"
    const owner = await instructor()
    const h = await hook(owner, "http://127.0.0.1:1/hook") // nothing listens on port 1
    const d = await WebhookDelivery.create({ webhook: h._id, owner: owner._id, event: "ping", payload: {} })
    const ev = await enqueueEvent("webhook.delivery_requested", { deliveryId: String(d._id) })
    await OutboxEvent.updateOne({ _id: ev._id }, { $set: { attempts: 24 } })
    await relay.drain()
    expect((await WebhookDelivery.findById(d._id)).status).toBe("failed")
  })
})

describe("M39: revoking sessions disconnects sockets", () => {
  let httpServer
  let url
  beforeAll(async () => {
    httpServer = http.createServer(app)
    initRealtime(httpServer)
    await new Promise((r) => httpServer.listen(0, r))
    url = `http://127.0.0.1:${httpServer.address().port}`
  })
  afterAll(async () => {
    await closeRealtime()
    await new Promise((r) => httpServer.close(r))
  })
  const connect = (token) =>
    new Promise((resolve, reject) => {
      const s = connectClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false })
      s.on("connect", () => resolve(s))
      s.on("connect_error", reject)
    })
  const waitForDisconnect = (s) => new Promise((resolve) => (s.connected ? s.once("disconnect", (reason) => resolve(reason)) : resolve("already")))

  test("sign out everywhere", async () => {
    const user = await student()
    const token = (await login(user.email)).body.token
    const sock = await connect(token)
    const gone = waitForDisconnect(sock)
    await request(app).post("/api/v1/auth/logout-all").set(bearer(token))
    expect(await gone).toBe("io server disconnect")
  })

  test("signing out one session ends only its sockets", async () => {
    const user = await student()
    const a = (await login(user.email)).body.token
    const b = (await login(user.email)).body.token
    const sockA = await connect(a)
    const sockB = await connect(b)
    const goneA = waitForDisconnect(sockA)
    await request(app).post("/api/v1/auth/logout").set(XHR).set(bearer(a))
    expect(await goneA).toBe("io server disconnect")
    await new Promise((r) => setTimeout(r, 100))
    expect(sockB.connected).toBe(true)
    sockB.disconnect()
  })

  test("an admin deactivating the account", async () => {
    const user = await student()
    const boss = await admin()
    const sock = await connect((await login(user.email)).body.token)
    const gone = waitForDisconnect(sock)
    await request(app).post("/api/v1/admin/users/set-active").set(auth(boss)).send({ userId: String(user._id), active: false })
    expect(await gone).toBe("io server disconnect")
  })
})

describe("M1: nothing reveals whether an email has an account", () => {
  test("sendotp answers the same and emails the owner instead", async () => {
    const user = await student()
    const known = await request(app).post("/api/v1/auth/sendotp").send({ email: user.email })
    const unknown = await request(app).post("/api/v1/auth/sendotp").send({ email: "new@example.com" })
    expect(known.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
    expect(await OutboxEvent.countDocuments({ type: "account.exists_signup_attempt", "payload.email": user.email })).toBe(1)
    expect(await OutboxEvent.countDocuments({ type: "otp.requested", "payload.email": user.email })).toBe(0)
  })

  test("locked and deactivated accounts look like unknown ones without the password", async () => {
    const locked = await student()
    await User.updateOne({ _id: locked._id }, { lockUntil: Date.now() + 600000 })
    const off = await student({ active: false })
    const unknown = await login("nobody@example.com")
    for (const email of [locked.email, off.email]) {
      const res = await login(email, "wrong-password")
      expect(res.status).toBe(unknown.status)
      expect(res.body.message).toBe(unknown.body.message)
    }
    expect((await login(locked.email)).status).toBe(423)
    expect((await login(off.email)).status).toBe(403)
  })
})

describe("M7, M8, L17: two-factor", () => {
  async function enable(user) {
    const first = await login(user.email)
    const token = first.body.token
    const setup = await request(app).post("/api/v1/auth/2fa/setup").set(bearer(token))
    const secret = setup.body.data.secret
    const res = await request(app).post("/api/v1/auth/2fa/enable").set(bearer(token)).set("Cookie", cookieOf(first)).send({ code: totp.codeForStep(secret, totp.stepAt()), password: "Password123" })
    return { res, token, cookie: cookieOf(first), secret }
  }

  test("M7: recovery codes are 80 bits and stored as an HMAC", async () => {
    const user = await student()
    const { res } = await enable(user)
    const codes = res.body.data.recoveryCodes
    expect(codes[0]).toMatch(/^[0-9a-f]{5}(-[0-9a-f]{5}){3}$/)
    const stored = (await User.findById(user._id).select("+twoFactor")).twoFactor.recoveryCodes
    const plainSha = crypto.createHash("sha256").update(codes[0].replace(/-/g, "")).digest("hex")
    expect(stored).not.toContain(plainSha)
  })

  test("M7: codes made before the change still work", async () => {
    const user = await student()
    const { secret } = await enable(user)
    const legacy = "a1b2c-3d4e5"
    const legacyHash = crypto.createHash("sha256").update("a1b2c3d4e5").digest("hex")
    await User.updateOne({ _id: user._id }, { $push: { "twoFactor.recoveryCodes": legacyHash } })
    const step1 = await login(user.email)
    const ok = await request(app).post("/api/v1/auth/login/2fa").send({ challenge: step1.body.challenge, code: legacy })
    expect(ok.status).toBe(200)
    expect(secret).toBeTruthy()
  })

  test("M8: other devices lose access at once; this one stays signed in", async () => {
    const user = await student()
    const other = await login(user.email)
    const { res, token, cookie } = await enable(user)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(other.body.token))).status).toBe(401)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(token))).status).toBe(401)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(res.body.data.token))).status).toBe(200)
    expect((await request(app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", cookie)).status).toBe(200)
    expect((await request(app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", cookieOf(other))).status).toBe(401)
    expect(await OutboxEvent.countDocuments({ type: "account.security_changed" })).toBe(1)
  })

  test("L17: an encrypted secret copied onto another user can't be decrypted", async () => {
    const sealed = secretBox.seal("JBSWY3DP", "user:aaa")
    expect(secretBox.open(sealed, "user:aaa")).toBe("JBSWY3DP")
    expect(() => secretBox.open(sealed, "user:bbb")).toThrow()
    const legacy = secretBox.seal("JBSWY3DP")
    expect(secretBox.open(legacy, "user:anyone")).toBe("JBSWY3DP")
  })
})

describe("M9: admin tools need 2FA in production", () => {
  test("refused without it, allowed when switched off", async () => {
    const boss = await admin()
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      expect((await request(app).get("/api/v1/admin/courses/pending").set(auth(boss))).status).toBe(403)
      process.env.REQUIRE_ADMIN_2FA = "0"
      expect((await request(app).get("/api/v1/admin/courses/pending").set(auth(boss))).status).toBe(200)
    } finally {
      process.env.NODE_ENV = previous
      delete process.env.REQUIRE_ADMIN_2FA
    }
  })
})

describe("M14 and L18: auditing", () => {
  test("refused admin actions, archiving a course and deleting an account are recorded", async () => {
    const nosy = await student()
    await request(app).post("/api/v1/admin/courses/approve").set(auth(nosy)).send({ courseId: String(new mongoose.Types.ObjectId()) })
    const owner = await instructor()
    const c = await course(owner)
    await request(app).delete("/api/v1/course/deleteCourse").set(auth(owner)).send({ courseId: String(c._id) })
    await request(app).delete("/api/v1/profile/deleteProfile").set(auth(nosy))
    await new Promise((r) => setTimeout(r, 100))
    expect(await AuditLog.countDocuments({ action: "admin.course_approve", outcome: "failure" })).toBe(1)
    expect(await AuditLog.countDocuments({ action: "course.archive", outcome: "success" })).toBe(1)
    expect(await AuditLog.countDocuments({ action: "account.delete" })).toBe(1)
  })

  test("entries expire, and a password typed as an email is never recorded", async () => {
    await AuditLog.init()
    const indexes = await AuditLog.collection.indexes()
    expect(indexes.some((i) => i.key.createdAt === 1 && i.expireAfterSeconds > 0)).toBe(true)
    // Not an email: refused by validation before anything is written.
    expect((await login("MySecretPassword!", "x")).status).toBe(400)
    await login("Unknown.Person@Example.com", "x")
    const entries = await AuditLog.find({ action: "auth.login", outcome: "failure" }).lean()
    expect(entries.map((e) => e.metadata.email)).toEqual(["unknown.person@example.com"])
  })
})

describe("M16: updates are validated", () => {
  test("an invalid enum value is refused by updateOne", async () => {
    const c = await course(await instructor())
    await expect(Course.updateOne({ _id: c._id }, { status: "Nope" })).rejects.toThrow()
  })
})

describe("M23: password hashing", () => {
  test("new hashes use scrypt; old bcrypt hashes still work and are upgraded", async () => {
    const hashed = await hashPassword("Password123")
    expect(hashed).toMatch(/^scrypt\$/)
    expect(await verifyPassword("Password123", hashed)).toBe(true)
    expect(await verifyPassword("wrong", hashed)).toBe(false)
    const user = await student() // the test helper stores a bcrypt hash
    expect(user.password).toMatch(/^\$2/)
    expect((await login(user.email)).status).toBe(200)
    expect((await User.findById(user._id)).password).toMatch(/^scrypt\$/)
    expect((await login(user.email)).status).toBe(200)
  })

  test("hashing doesn't block the event loop", async () => {
    let maxLag = 0
    let last = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      maxLag = Math.max(maxLag, now - last - 5)
      last = now
    }, 5)
    await Promise.all([hashPassword("a"), hashPassword("b"), hashPassword("c")])
    clearInterval(timer)
    expect(maxLag).toBeLessThan(40)
  })
})

describe("M34 and U5: the MongoDB search fallback", () => {
  test("best match ranks by text score, and ratings come with the page", async () => {
    const owner = await instructor()
    await course(owner, { courseName: "Docker compose deep dive", courseDescription: "docker compose docker compose", createdAt: new Date(1000) })
    await course(owner, { courseName: "Kubernetes intro", courseDescription: "mentions docker once", createdAt: new Date(5000) })
    await Course.init()
    const res = await request(app).post("/api/v1/course/searchCourses").send({ search: "docker compose" })
    expect(res.status).toBe(200)
    expect(res.body.data[0].courseName).toBe("Docker compose deep dive")
    expect(res.body.data[0]).toHaveProperty("avgRating")
    expect(res.body.data[0]).not.toHaveProperty("score")
  })
})

describe("Low fixes", () => {
  test("L5: a rejected createCourse doesn't block the corrected one", async () => {
    const owner = await instructor()
    const category = await Category.create({ name: "Cat" })
    const first = await request(app).post("/api/v1/course/createCourse").set(auth(owner)).set("Idempotency-Key", "create-course-1").field("courseName", "")
    expect(first.status).toBe(400)
    const second = await request(app)
      .post("/api/v1/course/createCourse")
      .set(auth(owner))
      .set("Idempotency-Key", "create-course-1")
      .field("courseName", "Valid").field("courseDescription", "d").field("whatYouWillLearn", "w").field("price", "10")
      .field("tag", '["t"]').field("category", String(category._id)).field("instructions", '["i"]')
      .attach("thumbnailImage", Buffer.from("img"), "t.png")
    expect(second.status).not.toBe(422)
    expect(second.headers["idempotent-replayed"]).toBeUndefined()
  })

  test("L6: deleteCourse's 404 has the usual shape", async () => {
    const res = await request(app).delete("/api/v1/course/deleteCourse").set(auth(await instructor())).send({ courseId: String(new mongoose.Types.ObjectId()) })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test("L15 and L35: unused fields and redundant indexes are gone", () => {
    expect(User.schema.path("token")).toBeUndefined()
    expect(User.schema.path("approved")).toBeUndefined()
    expect(Course.schema.path("status")._index).toBeFalsy()
    expect(Course.schema.path("instructor")._index).toBeFalsy()
  })

  test("L16: access tokens carry no email or role", async () => {
    const user = await student()
    const payload = jwt.decode((await login(user.email)).body.token)
    expect(payload.email).toBeUndefined()
    expect(payload.accountType).toBeUndefined()
  })

  test("L20: a lost refresh response is recovered from the same browser only", async () => {
    const user = await student()
    const first = await login(user.email, "Password123", { "User-Agent": "my-browser" })
    const old = cookieOf(first)
    await request(app).post("/api/v1/auth/refresh").set(XHR).set("User-Agent", "my-browser").set("Cookie", old)
    await RefreshToken.updateMany({ usedAt: { $ne: null } }, { $set: { usedAt: new Date(Date.now() - 30000) } })
    const retry = await request(app).post("/api/v1/auth/refresh").set(XHR).set("User-Agent", "my-browser").set("Cookie", old)
    expect(retry.status).toBe(200)
    await RefreshToken.updateMany({ usedAt: { $ne: null } }, { $set: { usedAt: new Date(Date.now() - 30000) } })
    const thief = await request(app).post("/api/v1/auth/refresh").set(XHR).set("User-Agent", "other-browser").set("Cookie", old)
    expect(thief.status).toBe(401)
  })

  test("L21: API docs are hidden in production unless enabled", async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      expect((await request(app).get("/api/openapi.json")).status).toBe(404)
      process.env.DOCS_PUBLIC = "1"
      expect((await request(app).get("/api/openapi.json")).status).toBe(200)
    } finally {
      process.env.NODE_ENV = previous
      delete process.env.DOCS_PUBLIC
    }
  })

  test("L24: request bodies are validated", async () => {
    const user = await student()
    expect((await request(app).post("/api/v1/course/searchCourses").send({ search: { $ne: 1 } })).status).toBe(400)
    expect((await request(app).post("/api/v1/payment/capturePayment").set(auth(user)).send({ courses: ["nope"] })).status).toBe(400)
    expect((await request(app).post("/api/v1/chatbot/chat").set(auth(user)).send({ message: "" })).status).toBe(400)
    const owner = await instructor()
    expect((await request(app).post("/api/v1/webhooks/not-an-id/test").set(auth(owner))).status).toBe(400)
  })

  test("L27: a coupon can be limited per student", async () => {
    const buyer = await student()
    await Coupon.create({ code: "ONCE", discountType: "flat", discountValue: 10, perUserLimit: 1 })
    await PaymentRecord.create({ orderId: "prior", user: buyer._id, courses: [], amount: 10, couponCode: "ONCE", source: "verify" })
    const c = await course(await instructor())
    const res = await request(app).post("/api/v1/payment/capturePayment").set(auth(buyer)).send({ courses: [String(c._id)], couponCode: "ONCE" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already used/)
  })

  test("L28: the same body in a different key order is the same request", async () => {
    const buyer = await student()
    const c = await course(await instructor())
    mockOrders.create.mockResolvedValue({ id: "order_x", amount: 50000, currency: "INR" })
    const a = await request(app).post("/api/v1/payment/capturePayment").set(auth(buyer)).set("Idempotency-Key", "order-key-1").send({ courses: [String(c._id)], couponCode: "" })
    const b = await request(app).post("/api/v1/payment/capturePayment").set(auth(buyer)).set("Idempotency-Key", "order-key-1").send({ couponCode: "", courses: [String(c._id)] })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(b.headers["idempotent-replayed"]).toBe("true")
  })

  test("L30: full buckets are swept from the in-process fallback", async () => {
    resetLocalBuckets()
    for (let i = 0; i < 50; i++) await take(`sweep:${i}`, { capacity: 5, refillPerSec: 1000 })
    await new Promise((r) => setTimeout(r, 20))
    expect(sweepLocalBuckets()).toBe(0)
  })

  test("L36: category names are unique, ignoring case", async () => {
    await Category.init()
    const boss = await admin()
    await request(app).post("/api/v1/course/createCategory").set(auth(boss)).send({ name: "Web Development" })
    const dup = await request(app).post("/api/v1/course/createCategory").set(auth(boss)).send({ name: "web development" })
    expect(dup.status).toBe(400)
    expect(await Category.countDocuments()).toBe(1)
  })

  test("L39: a full refund made in Razorpay's dashboard takes the course back", async () => {
    const buyer = await student()
    const c = await course(await instructor(), { studentsEnroled: [buyer._id] })
    await User.updateOne({ _id: buyer._id }, { $push: { courses: c._id } })
    await PaymentRecord.create({ orderId: "order_e", paymentId: "pay_e", user: buyer._id, courses: [c._id], amount: 500, source: "verify" })
    const raw = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_e", payment_id: "pay_e", amount: 50000, notes: {} } } } })
    const res = await request(app).post("/api/v1/payment/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", hmac("test_webhook_secret", raw)).send(raw)
    expect(res.body.enrollmentRemoved).toBe(true)
    expect((await PaymentRecord.findOne({ orderId: "order_e" })).status).toBe("refunded")
    expect((await Course.findById(c._id)).studentsEnroled).toHaveLength(0)

    const dispute = JSON.stringify({ event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_1", payment_id: "pay_e" } } } })
    const disputed = await request(app).post("/api/v1/payment/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", hmac("test_webhook_secret", dispute)).send(dispute)
    expect(disputed.body).toEqual({ success: true, recorded: true })
    expect((await PaymentRecord.findOne({ orderId: "order_e" })).disputedAt).toBeTruthy()
  })

  test("L40: public catalog reads can be cached by browsers", async () => {
    const res = await request(app).get("/api/v1/course/getAllCourses")
    expect(res.headers["cache-control"]).toMatch(/public, max-age=30/)
  })

  test("L44 and L48: Gemini gets the key in a header and a timeout signal", async () => {
    process.env.GEMINI_API_KEY = "test-key-123456"
    const spy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }) })
    const { callGemini } = require("../utils/gemini")
    await callGemini("hello")
    const [url, options] = spy.mock.calls[0]
    expect(url).not.toMatch(/key=/)
    expect(options.headers["x-goog-api-key"]).toBe("test-key-123456")
    expect(options.signal).toBeDefined()
  })

  test("L51 and D8: the DLQ replay script and the server README exist", () => {
    expect(fs.existsSync(path.join(__dirname, "../scripts/replayDlq.js"))).toBe(true)
    expect(fs.readFileSync(path.join(__dirname, "../README.md"), "utf8").length).toBeGreaterThan(500)
  })
})

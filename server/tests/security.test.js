process.env.ENCRYPTION_KEY = "ab".repeat(32)

const express = require("express")
const jwt = require("jsonwebtoken")
const request = require("supertest")
const app = require("../app")
const User = require("../models/User")
const Course = require("../models/Course")
const Coupon = require("../models/Coupon")
const AuditLog = require("../models/AuditLog")
const RefreshToken = require("../models/RefreshToken")
const totp = require("../utils/totp")
const secretBox = require("../utils/secretBox")
const { can, permissionsFor } = require("../config/permissions")
const { idempotent, resetIdempotencyStore } = require("../middleware/idempotency")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

beforeAll(async () => {
  await startTestDb()
}, 120000)

afterAll(async () => {
  await stopTestDb()
})

afterEach(async () => {
  resetIdempotencyStore()
  await clearTestDb()
})

const XHR = { "X-Requested-With": "XMLHttpRequest" }
const bearer = (token) => ({ Authorization: `Bearer ${token}` })
const refreshCookie = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("refreshToken="))
const cookieValue = (setCookie) => setCookie.split(";")[0]

async function login(email, password = "Password123") {
  return request(app).post("/api/v1/auth/login").send({ email, password })
}
const refresh = (cookie) => request(app).post("/api/v1/auth/refresh").set(XHR).set("Cookie", cookie)

// Waits for audit rows written after the response has finished.
async function auditRows(filter) {
  for (let i = 0; i < 20; i++) {
    const rows = await AuditLog.find(filter).lean()
    if (rows.length) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  return []
}

describe("TOTP (RFC 6238 test vectors)", () => {
  const secret = totp.base32Encode(Buffer.from("12345678901234567890"))

  test("codes match the published SHA-1 vectors (last 6 digits)", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
    expect(totp.codeForStep(secret, totp.stepAt(59 * 1000))).toBe("287082")
    expect(totp.codeForStep(secret, totp.stepAt(1111111109 * 1000))).toBe("081804")
    expect(totp.codeForStep(secret, totp.stepAt(1234567890 * 1000))).toBe("005924")
  })

  test("accepts one step of clock drift, refuses older steps and replays", () => {
    const now = 1234567890 * 1000
    const step = totp.stepAt(now)
    expect(totp.verify(secret, totp.codeForStep(secret, step - 1), { now })).toBe(step - 1)
    expect(totp.verify(secret, totp.codeForStep(secret, step - 2), { now })).toBeNull()
    expect(totp.verify(secret, totp.codeForStep(secret, step), { now, afterStep: step })).toBeNull()
    expect(totp.verify(secret, "12345", { now })).toBeNull()
  })

  test("secrets are encrypted at rest and tampering is detected", () => {
    const sealed = secretBox.seal("JBSWY3DPEHPK3PXP")
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP")
    expect(secretBox.open(sealed)).toBe("JBSWY3DPEHPK3PXP")
    const parts = sealed.split(".")
    parts[3] = Buffer.from("tampered").toString("base64url")
    expect(() => secretBox.open(parts.join("."))).toThrow()
  })
})

describe("sessions: short access token + rotating refresh token", () => {
  test("login returns a 15-minute access token and an httpOnly refresh cookie scoped to /api/v1/auth", async () => {
    await createUser({ email: "s1@example.com" })
    const res = await login("s1@example.com")
    expect(res.status).toBe(200)
    const { exp, iat } = jwt.decode(res.body.token)
    expect(exp - iat).toBe(15 * 60)
    const cookie = refreshCookie(res)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/)
    expect(res.body.user.password).toBeUndefined()
    expect(res.body.user.twoFactor).toBeUndefined()
  })

  test("refresh rotates the cookie and issues a working access token", async () => {
    await createUser({ email: "s2@example.com" })
    const first = cookieValue(refreshCookie(await login("s2@example.com")))
    const res = await refresh(first)
    expect(res.status).toBe(200)
    const second = cookieValue(refreshCookie(res))
    expect(second).not.toBe(first)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(res.body.token))).status).toBe(200)
  })

  test("refresh needs the X-Requested-With header (blocks cross-site form posts)", async () => {
    await createUser({ email: "s3@example.com" })
    const cookie = cookieValue(refreshCookie(await login("s3@example.com")))
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(403)
  })

  test("a replayed refresh token revokes the whole family", async () => {
    await createUser({ email: "s4@example.com" })
    const stolen = cookieValue(refreshCookie(await login("s4@example.com")))
    const legit = cookieValue(refreshCookie(await refresh(stolen)))

    // Inside the grace window a duplicate is treated as two tabs racing.
    const racing = await refresh(stolen)
    expect(racing.status).toBe(409)

    // Later, the same used token is a replay.
    await RefreshToken.updateMany({ usedAt: { $ne: null } }, { $set: { usedAt: new Date(Date.now() - 60000) } })
    const replay = await refresh(stolen)
    expect(replay.status).toBe(401)
    expect(replay.body.code).toBe("reuse")

    // ...and the legitimate holder's newer token is dead too.
    expect((await refresh(legit)).status).toBe(401)
    expect(await auditRows({ action: "auth.refresh_reuse_detected" })).toHaveLength(1)
  })

  test("logout revokes the refresh family; logout-all and password change end every session", async () => {
    await createUser({ email: "s5@example.com" })
    const a = await login("s5@example.com")
    const b = await login("s5@example.com")
    const cookieA = cookieValue(refreshCookie(a))
    const cookieB = cookieValue(refreshCookie(b))

    const out = await request(app).post("/api/v1/auth/logout").set(XHR).set(bearer(a.body.token)).set("Cookie", cookieA)
    expect(out.status).toBe(200)
    expect((await refresh(cookieA)).status).toBe(401)
    expect((await refresh(cookieB)).status).toBe(200)

    const c = await login("s5@example.com")
    await request(app).post("/api/v1/auth/logout-all").set(bearer(c.body.token))
    expect((await refresh(cookieValue(refreshCookie(c)))).status).toBe(401)
    expect((await request(app).get("/api/v1/profile/getUserDetails").set(bearer(c.body.token))).status).toBe(401)
  })

  test("sessions can be listed and signed out one by one", async () => {
    await createUser({ email: "s6@example.com" })
    const a = await login("s6@example.com")
    await login("s6@example.com")
    const list = await request(app).get("/api/v1/auth/sessions").set(bearer(a.body.token)).set("Cookie", cookieValue(refreshCookie(a)))
    expect(list.body.data).toHaveLength(2)
    const other = list.body.data.find((s) => !s.current)
    expect(list.body.data.filter((s) => s.current)).toHaveLength(1)

    const revoked = await request(app).post("/api/v1/auth/sessions/revoke").set(bearer(a.body.token)).send({ sessionId: other.id })
    expect(revoked.status).toBe(200)
    const after = await request(app).get("/api/v1/auth/sessions").set(bearer(a.body.token))
    expect(after.body.data).toHaveLength(1)
  })

  test("a deactivated user's refresh token stops working", async () => {
    const user = await createUser({ email: "s7@example.com" })
    const cookie = cookieValue(refreshCookie(await login("s7@example.com")))
    await User.updateOne({ _id: user._id }, { active: false })
    expect((await refresh(cookie)).status).toBe(401)
  })
})

describe("two-factor authentication", () => {
  async function enable(email) {
    await createUser({ email })
    const token = (await login(email)).body.token
    const setup = await request(app).post("/api/v1/auth/2fa/setup").set(bearer(token))
    expect(setup.status).toBe(200)
    expect(setup.body.data.qrCode).toMatch(/^data:image\/png;base64,/)
    const secret = setup.body.data.secret
    const enabled = await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set(bearer(token))
      .send({ code: totp.codeForStep(secret, totp.stepAt()) })
    expect(enabled.status).toBe(200)
    return { token, secret, recoveryCodes: enabled.body.data.recoveryCodes }
  }

  test("the secret is stored encrypted and never returned with the user", async () => {
    const { secret, recoveryCodes } = await enable("t1@example.com")
    expect(recoveryCodes).toHaveLength(8)
    const stored = await User.findOne({ email: "t1@example.com" }).select("+twoFactor").lean()
    expect(stored.twoFactorEnabled).toBe(true)
    expect(stored.twoFactor.secret).not.toContain(secret)
    expect(stored.twoFactor.recoveryCodes).not.toContain(recoveryCodes[0])
    const plain = await User.findOne({ email: "t1@example.com" }).lean()
    expect(plain.twoFactor).toBeUndefined()
  })

  test("login needs the second factor; a code works once", async () => {
    const { secret } = await enable("t2@example.com")
    // Codes for the step used during enable are spent; use the next step.
    const step = totp.stepAt() + 1
    const first = await login("t2@example.com")
    expect(first.body).toMatchObject({ twoFactorRequired: true })
    expect(first.body.token).toBeUndefined()
    expect(refreshCookie(first)).toBeUndefined()

    const code = totp.codeForStep(secret, step)
    const ok = await request(app).post("/api/v1/auth/login/2fa").send({ challenge: first.body.challenge, code })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()
    expect(refreshCookie(ok)).toBeTruthy()

    const again = await login("t2@example.com")
    const replay = await request(app).post("/api/v1/auth/login/2fa").send({ challenge: again.body.challenge, code })
    expect(replay.status).toBe(401)
  })

  test("recovery codes work once; wrong codes lock the account", async () => {
    const { recoveryCodes } = await enable("t3@example.com")
    const challenge = (await login("t3@example.com")).body.challenge
    const ok = await request(app).post("/api/v1/auth/login/2fa").send({ challenge, code: recoveryCodes[0] })
    expect(ok.status).toBe(200)
    const reused = await request(app).post("/api/v1/auth/login/2fa").send({ challenge, code: recoveryCodes[0] })
    expect(reused.status).toBe(401)

    for (let i = 0; i < 4; i++) {
      await request(app).post("/api/v1/auth/login/2fa").send({ challenge, code: "000000" })
    }
    const locked = await request(app).post("/api/v1/auth/login/2fa").send({ challenge, code: recoveryCodes[1] })
    expect(locked.status).toBe(423)
  })

  test("disabling needs the password and a valid code", async () => {
    const { token, secret } = await enable("t4@example.com")
    const code = totp.codeForStep(secret, totp.stepAt() + 1)
    const wrong = await request(app).post("/api/v1/auth/2fa/disable").set(bearer(token)).send({ password: "nope", code })
    expect(wrong.status).toBe(400)
    const ok = await request(app).post("/api/v1/auth/2fa/disable").set(bearer(token)).send({ password: "Password123", code })
    expect(ok.status).toBe(200)
    expect((await login("t4@example.com")).body.token).toBeTruthy()
  })
})

describe("RBAC", () => {
  test("permissions are defined per role", () => {
    expect(can("Admin", "audit:read")).toBe(true)
    expect(can("Instructor", "audit:read")).toBe(false)
    expect(can("Student", "course:purchase")).toBe(true)
    expect(permissionsFor("Nobody")).toEqual([])
  })

  test("authenticated users without the permission get 403, not 401", async () => {
    const instructor = await createUser({ email: "r1@example.com", accountType: "Instructor" })
    const res = await request(app)
      .post("/api/v1/coupon/create")
      .set(bearer(tokenFor(instructor)))
      .send({ code: "SAVE10", discountType: "percentage", discountValue: 10 })
    expect(res.status).toBe(403)
  })

  test("the role is read from the database, so a demotion applies immediately", async () => {
    const admin = await createUser({ email: "r2@example.com", accountType: "Admin" })
    const token = tokenFor(admin)
    expect((await request(app).get("/api/v1/admin/audit-logs").set(bearer(token))).status).toBe(200)
    await User.updateOne({ _id: admin._id }, { accountType: "Instructor" })
    expect((await request(app).get("/api/v1/admin/audit-logs").set(bearer(token))).status).toBe(403)
  })
})

describe("audit log", () => {
  test("admin actions and failed logins are recorded; entries cannot be changed", async () => {
    const admin = await createUser({ email: "a1@example.com", accountType: "Admin" })
    const instructor = await createUser({ email: "a2@example.com", accountType: "Instructor" })
    const course = await Course.create({
      courseName: "Pending",
      courseDescription: "d",
      instructor: instructor._id,
      whatYouWillLearn: "w",
      price: 10,
      tag: ["t"],
      thumbnail: "http://example.com/t.jpg",
      instructions: ["i"],
      status: "Pending",
    })
    await request(app).post("/api/v1/admin/courses/approve").set(bearer(tokenFor(admin))).send({ courseId: String(course._id) })
    await login("a2@example.com", "WrongPassword1")

    const [approve] = await auditRows({ action: "admin.course_approve" })
    expect(approve).toMatchObject({ outcome: "success", actorEmail: "a1@example.com", actorRole: "Admin", targetId: String(course._id) })
    const [failed] = await auditRows({ action: "auth.login", outcome: "failure" })
    expect(failed.metadata.reason).toBe("bad_password")

    await expect(AuditLog.updateOne({ _id: approve._id }, { outcome: "failure" })).rejects.toThrow(/append-only/)
    await expect(AuditLog.deleteOne({ _id: approve._id })).rejects.toThrow(/append-only/)
  })

  test("admins page through the log with a cursor", async () => {
    const admin = await createUser({ email: "a3@example.com", accountType: "Admin" })
    await AuditLog.insertMany(Array.from({ length: 5 }, (_, i) => ({ action: `test.action${i}` })))
    const get = (q) => request(app).get(`/api/v1/admin/audit-logs?${q}`).set(bearer(tokenFor(admin)))
    const page1 = await get("limit=3")
    expect(page1.body.data).toHaveLength(3)
    expect(page1.body.data[0].action).toBe("test.action4")
    const page2 = await get(`limit=3&before=${page1.body.nextCursor}`)
    expect(page2.body.data.map((r) => r.action)).toEqual(["test.action1", "test.action0"])
    expect(page2.body.nextCursor).toBeNull()
  })
})

describe("idempotency keys", () => {
  test("a repeated create replays the first response and creates nothing new", async () => {
    const admin = await createUser({ email: "i1@example.com", accountType: "Admin" })
    const send = (body, key = "coupon-key-0001") =>
      request(app).post("/api/v1/coupon/create").set(bearer(tokenFor(admin))).set("Idempotency-Key", key).send(body)
    const body = { code: "ONCE10", discountType: "percentage", discountValue: 10 }

    const first = await send(body)
    expect(first.status).toBe(201)
    const second = await send(body)
    expect(second.status).toBe(first.status)
    expect(second.headers["idempotent-replayed"]).toBe("true")
    expect(second.body).toEqual(first.body)
    expect(await Coupon.countDocuments()).toBe(1)

    const misuse = await send({ ...body, discountValue: 50 })
    expect(misuse.status).toBe(422)
  })

  test("a free checkout clicked twice enrolls once", async () => {
    const instructor = await createUser({ email: "i2@example.com", accountType: "Instructor" })
    const student = await createUser({ email: "i3@example.com" })
    const course = await Course.create({
      courseName: "Free",
      courseDescription: "d",
      instructor: instructor._id,
      whatYouWillLearn: "w",
      price: 0,
      tag: ["t"],
      thumbnail: "http://example.com/t.jpg",
      instructions: ["i"],
      status: "Published",
    })
    const buy = () =>
      request(app)
        .post("/api/v1/payment/capturePayment")
        .set(bearer(tokenFor(student)))
        .set("Idempotency-Key", "checkout-0001")
        .send({ courses: [String(course._id)] })
    const [a, b] = [await buy(), await buy()]
    expect(a.body).toMatchObject({ success: true, freeEnrollment: true })
    expect(b.body).toEqual(a.body)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect((await Course.findById(course._id)).studentsEnroled).toHaveLength(1)
  })

  test("in-flight duplicates get 409; server errors are not stored", async () => {
    let calls = 0
    let release
    const mini = express()
    mini.use(express.json())
    mini.post("/slow", idempotent(), async (req, res) => {
      calls++
      await new Promise((r) => (release = r))
      res.json({ ok: true })
    })
    mini.post("/broken", idempotent(), (req, res) => {
      calls++
      res.status(500).json({ ok: false })
    })

    const pending = request(mini).post("/slow").set("Idempotency-Key", "slow-key-0001").send({}).then((r) => r)
    await new Promise((r) => setTimeout(r, 50))
    const dup = await request(mini).post("/slow").set("Idempotency-Key", "slow-key-0001").send({})
    expect(dup.status).toBe(409)
    release()
    expect((await pending).status).toBe(200)

    calls = 0
    await request(mini).post("/broken").set("Idempotency-Key", "broken-key-01").send({})
    await new Promise((r) => setTimeout(r, 20))
    await request(mini).post("/broken").set("Idempotency-Key", "broken-key-01").send({})
    expect(calls).toBe(2)
  })
})

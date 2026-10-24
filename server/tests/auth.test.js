jest.mock("../utils/mailSender", () => jest.fn().mockResolvedValue({ response: "mocked" }))

const request = require("supertest")
const app = require("../app")
const OTP = require("../models/OTP")
const User = require("../models/User")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")

beforeAll(async () => {
  await startTestDb()
}, 120000)

afterAll(async () => {
  await stopTestDb()
})

afterEach(async () => {
  await clearTestDb()
})

describe("signup + login", () => {
  const email = "newuser@example.com"
  const password = "Password123"

  test("signup succeeds with a valid OTP, then login succeeds", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const otpDoc = await OTP.findOne({ email }).sort({ createdAt: -1 })
    expect(otpDoc).toBeTruthy()

    const signupRes = await request(app).post("/api/v1/auth/signup").send({
      firstName: "New",
      lastName: "User",
      email,
      password,
      confirmPassword: password,
      accountType: "Student",
      otp: otpDoc.otp,
    })
    expect(signupRes.status).toBe(200)
    expect(signupRes.body.success).toBe(true)
    // The signup response must never leak the password hash.
    expect(signupRes.body.user.password).toBeUndefined()

    const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body.success).toBe(true)
    expect(loginRes.body.token).toBeTruthy()
    expect(loginRes.body.user.password).toBeUndefined()
  })

  test("signup is rejected with a wrong OTP", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const res = await request(app).post("/api/v1/auth/signup").send({
      firstName: "New",
      lastName: "User",
      email,
      password,
      confirmPassword: password,
      accountType: "Student",
      otp: "000000",
    })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(await User.findOne({ email })).toBeNull()
  })
})

describe("login lockout", () => {
  const email = "lockout@example.com"
  const password = "CorrectPassword1"

  beforeEach(async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email })
    const otpDoc = await OTP.findOne({ email }).sort({ createdAt: -1 })
    await request(app).post("/api/v1/auth/signup").send({
      firstName: "Lock",
      lastName: "Out",
      email,
      password,
      confirmPassword: password,
      accountType: "Student",
      otp: otpDoc.otp,
    })
  })

  test("locks the account after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password: "WrongPassword" })
      expect(res.status).toBe(401)
    }

    // The 6th attempt is now locked out, even with the correct password.
    const lockedRes = await request(app).post("/api/v1/auth/login").send({ email, password })
    expect(lockedRes.status).toBe(423)
  })

  test("a successful login resets the failed-attempt counter", async () => {
    await request(app).post("/api/v1/auth/login").send({ email, password: "WrongPassword" })
    const res = await request(app).post("/api/v1/auth/login").send({ email, password })
    expect(res.status).toBe(200)
    const user = await User.findOne({ email })
    expect(user.failedLoginAttempts).toBe(0)
  })
})

describe("deactivated accounts", () => {
  test("cannot log in even with the correct password", async () => {
    const { createUser } = require("./helpers")
    const password = "Password123"
    const user = await createUser({ email: "deactivated@example.com", password, active: false })

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })
})

describe("duplicate email", () => {
  test("the unique index rejects a second account with the same email", async () => {
    const { createUser } = require("./helpers")
    await createUser({ email: "dup@example.com" })
    await expect(createUser({ email: "dup@example.com" })).rejects.toThrow()
  })
})

describe("signup request validation", () => {
  test("rejects a password shorter than 8 characters", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email: "short@example.com" })
    const otpDoc = await OTP.findOne({ email: "short@example.com" }).sort({ createdAt: -1 })

    const res = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Short",
      lastName: "Pass",
      email: "short@example.com",
      password: "abc123",
      confirmPassword: "abc123",
      accountType: "Student",
      otp: otpDoc.otp,
    })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(await User.findOne({ email: "short@example.com" })).toBeNull()
  })

  test("rejects a malformed email address", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "not-an-email",
      password: "whatever",
    })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  test("still rejects accountType: Admin even though it now fails at the validation layer", async () => {
    await request(app).post("/api/v1/auth/sendotp").send({ email: "wannabe-admin@example.com" })
    const otpDoc = await OTP.findOne({ email: "wannabe-admin@example.com" }).sort({ createdAt: -1 })

    const res = await request(app).post("/api/v1/auth/signup").send({
      firstName: "Wannabe",
      lastName: "Admin",
      email: "wannabe-admin@example.com",
      password: "Password123",
      confirmPassword: "Password123",
      accountType: "Admin",
      otp: otpDoc.otp,
    })
    expect(res.status).toBe(400)
    expect(await User.findOne({ email: "wannabe-admin@example.com" })).toBeNull()
  })
})

describe("password change invalidates the token that changed it", () => {
  test("the same token that changed the password is rejected on the very next request", async () => {
    const { createUser, tokenFor } = require("./helpers")
    const user = await createUser({ email: "rotate@example.com", password: "OldPassword1" })
    const token = tokenFor(user)

    const changeRes = await request(app)
      .post("/api/v1/auth/changepassword")
      .set("Authorization", `Bearer ${token}`)
      .send({ oldPassword: "OldPassword1", newPassword: "NewPassword1" })
    expect(changeRes.status).toBe(200)

    const staleRes = await request(app)
      .get("/api/v1/profile/getUserDetails")
      .set("Authorization", `Bearer ${token}`)
    expect(staleRes.status).toBe(401)

    // A fresh login (new tokenVersion baked into the token) works fine.
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "rotate@example.com", password: "NewPassword1" })
    expect(loginRes.status).toBe(200)
  })
})

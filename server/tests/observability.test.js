process.env.ENCRYPTION_KEY = "cd".repeat(32)

const http = require("http")
const request = require("supertest")
const app = require("../app")
const Course = require("../models/Course")
const Webhook = require("../models/Webhook")
const WebhookDelivery = require("../models/WebhookDelivery")
const { drain } = require("../events/relay")
const { sign, verifySignature, isPrivateAddress, assertDeliverableUrl } = require("../utils/webhooks")
const { startTestDb, stopTestDb, clearTestDb } = require("./setupTestDb")
const { createUser, tokenFor } = require("./helpers")

jest.mock("../utils/mailSender", () => jest.fn(async () => ({})))

beforeAll(async () => {
  await startTestDb()
}, 120000)

afterAll(async () => {
  await stopTestDb()
})

afterEach(async () => {
  delete process.env.METRICS_TOKEN
  delete process.env.ALLOW_PRIVATE_WEBHOOK_URLS
  await clearTestDb()
})

const bearer = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` })

describe("metrics", () => {
  test("/metrics exposes request latency by route template and app metrics", async () => {
    await request(app).get("/api/v1/course/getAllCourses")
    const res = await request(app).get("/metrics")
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/api\/v1\/course\/getAllCourses",status_code="200"\}/)
    expect(res.text).toMatch(/learnify_cache_requests_total/)
    expect(res.text).toMatch(/learnify_outbox_events\{status="pending"\}/)
  })

  test("route labels use templates, so ids do not create new series", async () => {
    await request(app).get("/api/v1/certificate/verify/abc123")
    await request(app).get("/api/v1/certificate/verify/def456")
    const res = await request(app).get("/metrics")
    expect(res.text).toMatch(/route="\/api\/v1\/certificate\/verify\/:certificateId"/)
    expect(res.text).not.toMatch(/abc123|def456/)
  })

  test("with METRICS_TOKEN set, scrapes need it", async () => {
    process.env.METRICS_TOKEN = "scrape-secret"
    expect((await request(app).get("/metrics")).status).toBe(401)
    expect((await request(app).get("/metrics").set("Authorization", "Bearer scrape-secret")).status).toBe(200)
  })
})

describe("OpenAPI", () => {
  test("the spec is generated from the routes, their validators and their guards", async () => {
    const res = await request(app).get("/api/openapi.json")
    expect(res.body.openapi).toBe("3.1.0")
    const create = res.body.paths["/api/v1/coupon/create"].post
    expect(create.security).toEqual([{ bearerAuth: [] }])
    expect(create.description).toMatch(/coupon:manage/)
    expect(create.parameters.map((p) => p.name)).toContain("Idempotency-Key")
    expect(create.requestBody.content["application/json"].schema.required).toEqual(expect.arrayContaining(["code", "discountType"]))
    // Router-level guards (router.use(auth, ...)) apply to every route below them.
    expect(res.body.paths["/api/v1/webhooks/{id}/test"].post.description).toMatch(/webhook:manage/)
    expect(res.body.paths["/api/v1/internal/courses"].get.security).toEqual([{ internalToken: [] }])
  })

  test("Swagger UI is served", async () => {
    const res = await request(app).get("/api/docs/")
    expect(res.status).toBe(200)
    expect(res.text).toMatch(/swagger-ui/)
  })
})

describe("webhook signing and URL safety", () => {
  test("signatures verify; tampering, a wrong secret or an old timestamp do not", () => {
    const body = JSON.stringify({ hello: "world" })
    const header = sign("whsec_x", body)
    expect(verifySignature("whsec_x", body, header)).toBe(true)
    expect(verifySignature("whsec_x", body + " ", header)).toBe(false)
    expect(verifySignature("whsec_y", body, header)).toBe(false)
    const old = sign("whsec_x", body, Math.floor(Date.now() / 1000) - 3600)
    expect(verifySignature("whsec_x", body, old)).toBe(false)
  })

  test("private, loopback and metadata addresses are refused", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
    await expect(assertDeliverableUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private or internal/)
    await expect(assertDeliverableUrl("http://localhost:4000/x")).rejects.toThrow(/private or internal/)
    await expect(assertDeliverableUrl("file:///etc/passwd")).rejects.toThrow(/http or https/)
    await expect(assertDeliverableUrl("https://user:pw@example.com")).rejects.toThrow(/credentials/)
  })
})

describe("webhooks end to end", () => {
  let server
  let received
  let respondWith

  beforeEach(async () => {
    received = []
    respondWith = 200
    server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        received.push({ headers: req.headers, body })
        res.statusCode = respondWith
        res.end("ok")
      })
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
  })

  afterEach(async () => {
    await new Promise((r) => server.close(r))
  })

  const receiverUrl = () => `http://127.0.0.1:${server.address().port}/hook`

  async function setup() {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1" // the test receiver is on localhost
    const instructor = await createUser({ email: "wh-ins@example.com", accountType: "Instructor" })
    const created = await request(app)
      .post("/api/v1/webhooks")
      .set(bearer(instructor))
      .send({ url: receiverUrl(), events: ["enrollment.created"], description: "test" })
    expect(created.status).toBe(201)
    return { instructor, hook: created.body.data, secret: created.body.data.secret }
  }

  test("an enrollment reaches the instructor's endpoint, signed", async () => {
    const { instructor, secret } = await setup()
    const student = await createUser({ email: "wh-stu@example.com" })
    const course = await Course.create({
      courseName: "Free course",
      courseDescription: "d",
      instructor: instructor._id,
      whatYouWillLearn: "w",
      price: 0,
      tag: ["t"],
      thumbnail: "http://example.com/t.jpg",
      instructions: ["i"],
      status: "Published",
    })
    await request(app).post("/api/v1/payment/capturePayment").set(bearer(student)).send({ courses: [String(course._id)] })

    await drain() // order.paid -> fan-out creates the delivery
    await drain() // delivery -> HTTP POST

    expect(received).toHaveLength(1)
    const { headers, body } = received[0]
    expect(headers["learnify-event"]).toBe("enrollment.created")
    expect(verifySignature(secret, body, headers["learnify-signature"])).toBe(true)
    const payload = JSON.parse(body)
    expect(payload.data).toMatchObject({ courseId: String(course._id), student: { firstName: "Test" } })
    expect(payload.id).toBe(headers["learnify-delivery"])
    const delivery = await WebhookDelivery.findById(payload.id)
    expect(delivery).toMatchObject({ status: "succeeded", responseStatus: 200, attempts: 1 })

    // Redelivered domain events do not fan out twice.
    await drain()
    expect(await WebhookDelivery.countDocuments()).toBe(1)
  })

  test("failures are recorded and retried; the secret is never stored in plain text", async () => {
    const { instructor, hook, secret } = await setup()
    respondWith = 500
    await request(app).post(`/api/v1/webhooks/${hook._id}/test`).set(bearer(instructor))
    await drain() // ping attempt fails; the relay will retry the event later
    const delivery = await WebhookDelivery.findOne({ event: "ping" })
    expect(delivery).toMatchObject({ status: "pending", responseStatus: 500, error: "HTTP 500" })
    expect((await Webhook.findById(hook._id)).consecutiveFailures).toBe(1)
    const stored = await Webhook.findById(hook._id).select("+secret").lean()
    expect(stored.secret).not.toContain(secret)

    const deliveries = await request(app).get(`/api/v1/webhooks/${hook._id}/deliveries`).set(bearer(instructor))
    expect(deliveries.body.data[0]).toMatchObject({ event: "ping", responseStatus: 500 })
  })

  test("only the owner can see or change a webhook; students cannot use the API", async () => {
    const { hook } = await setup()
    const other = await createUser({ email: "wh-other@example.com", accountType: "Instructor" })
    const student = await createUser({ email: "wh-s2@example.com" })
    expect((await request(app).get(`/api/v1/webhooks/${hook._id}/deliveries`).set(bearer(other))).status).toBe(404)
    expect((await request(app).delete(`/api/v1/webhooks/${hook._id}`).set(bearer(other))).status).toBe(404)
    expect((await request(app).get("/api/v1/webhooks").set(bearer(student))).status).toBe(403)
  })

  test("internal URLs are refused at creation", async () => {
    const instructor = await createUser({ email: "wh-ssrf@example.com", accountType: "Instructor" })
    const res = await request(app)
      .post("/api/v1/webhooks")
      .set(bearer(instructor))
      .send({ url: "http://169.254.169.254/latest/meta-data", events: ["review.created"] })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/private or internal/)
  })
})

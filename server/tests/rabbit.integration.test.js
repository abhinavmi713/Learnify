// Integration test against a REAL RabbitMQ (docker compose up -d rabbitmq).
// Skipped unless RABBITMQ_TEST_URL is set, so CI without a broker stays green:
//   RABBITMQ_TEST_URL=amqp://guest:guest@127.0.0.1:5672 npx jest tests/rabbit.integration.test.js
const url = process.env.RABBITMQ_TEST_URL
const maybe = url ? describe : describe.skip

maybe("RabbitMQ topology: publish, retry with delay, dead-letter", () => {
  const amqp = require("amqplib")
  let rabbit
  let probe
  let probeChannel
  const queue = `it_${Date.now()}`
  const type = `it.event.${Date.now()}`

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (cond, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await cond()) return true
      await sleep(50)
    }
    return false
  }

  beforeAll(async () => {
    process.env.RABBITMQ_URL = url
    rabbit = require("../config/rabbit")
    rabbit.start()
    expect(await until(() => rabbit.isConnected())).toBe(true)
    probe = await amqp.connect(url)
    probeChannel = await probe.createChannel()
  }, 30000)

  afterAll(async () => {
    const names = [queue, `${queue}.dlq`, `${queue}.retry.1`, `${queue}.retry.2`]
    for (const n of names) await probeChannel.deleteQueue(n).catch(() => {})
    await probe.close()
    await rabbit.close()
    delete process.env.RABBITMQ_URL
  })

  const event = (id) => ({ id, type, payload: { n: 1 }, occurredAt: new Date().toISOString() })

  test("a published event reaches the consumer bound to its type", async () => {
    const seen = []
    await rabbit.registerConsumer({ name: queue, bindings: [type], retryDelaysMs: [150, 150], handler: async (e) => seen.push(e.id) })
    await rabbit.publishEvent(event("ok-1"))
    expect(await until(() => seen.includes("ok-1"))).toBe(true)
  })

  test("a handler that fails once is retried after a delay and then succeeds", async () => {
    const q = `${queue}_retry`
    const times = []
    await rabbit.registerConsumer({
      name: q,
      bindings: [type],
      retryDelaysMs: [150, 150],
      handler: async (e) => {
        if (e.id !== "flaky-1") return
        times.push(Date.now())
        if (times.length === 1) throw new Error("transient")
      },
    })
    await rabbit.publishEvent(event("flaky-1"))
    expect(await until(() => times.length >= 2)).toBe(true)
    // The retry waited roughly the configured delay rather than hot-looping.
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(120)
    for (const n of [q, `${q}.dlq`, `${q}.retry.1`, `${q}.retry.2`]) await probeChannel.deleteQueue(n).catch(() => {})
  })

  test("a message that keeps failing lands in the dead-letter queue after the last attempt", async () => {
    const q = `${queue}_dlq`
    await rabbit.registerConsumer({
      name: q,
      bindings: [type],
      retryDelaysMs: [100, 100],
      handler: async (e) => {
        if (e.id === "poison-2") throw new Error("always fails")
      },
    })
    await rabbit.publishEvent(event("poison-2"))
    const landed = await until(async () => (await probeChannel.checkQueue(`${q}.dlq`)).messageCount >= 1, 10000)
    expect(landed).toBe(true)
    const msg = await probeChannel.get(`${q}.dlq`, { noAck: true })
    expect(JSON.parse(msg.content.toString()).id).toBe("poison-2")
    expect(msg.properties.headers["x-attempts"]).toBe(3)
    expect(msg.properties.headers["x-last-error"]).toMatch(/always fails/)
    for (const n of [q, `${q}.dlq`, `${q}.retry.1`, `${q}.retry.2`]) await probeChannel.deleteQueue(n).catch(() => {})
  }, 20000)

  test("a message that is not JSON goes straight to the dead-letter queue", async () => {
    const q = `${queue}_junk`
    await rabbit.registerConsumer({ name: q, bindings: [`junk.${type}`], retryDelaysMs: [100], handler: async () => {} })
    probeChannel.publish("learnify.events", `junk.${type}`, Buffer.from("not json {"), { persistent: true })
    const landed = await until(async () => (await probeChannel.checkQueue(`${q}.dlq`)).messageCount >= 1)
    expect(landed).toBe(true)
    for (const n of [q, `${q}.dlq`, `${q}.retry.1`]) await probeChannel.deleteQueue(n).catch(() => {})
  })

  test("publishing fails fast (so the outbox keeps the event) when the broker is unreachable", async () => {
    await rabbit.close()
    await expect(rabbit.publishEvent(event("offline-1"))).rejects.toThrow(/not connected/)
  })
})

// Moves messages from a queue's dead letter queue back to the queue, after the
// cause of the failures has been fixed. Retry counters start again.
//   node scripts/replayDlq.js <queue> [max]      (npm run dlq:replay -- email)
require("dotenv").config()
const amqp = require("amqplib")
const { WORK_EXCHANGE } = require("../config/rabbit")

async function main() {
  const queue = process.argv[2]
  const max = Number(process.argv[3]) || Infinity
  if (!queue) throw new Error("usage: node scripts/replayDlq.js <queue> [max]")
  if (!process.env.RABBITMQ_URL) throw new Error("RABBITMQ_URL is not set")
  const connection = await amqp.connect(process.env.RABBITMQ_URL)
  const channel = await connection.createConfirmChannel()
  let moved = 0
  while (moved < max) {
    const msg = await channel.get(`${queue}.dlq`, { noAck: false })
    if (!msg) break
    const { "x-attempts": _attempts, "x-last-error": lastError, ...headers } = msg.properties.headers || {}
    await new Promise((resolve, reject) =>
      channel.publish(WORK_EXCHANGE, queue, msg.content, { ...msg.properties, headers: { ...headers, "x-replayed-error": lastError } }, (e) => (e ? reject(e) : resolve()))
    )
    channel.ack(msg)
    moved++
  }
  console.log(`moved ${moved} message(s) from ${queue}.dlq back to ${queue}`)
  await connection.close()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

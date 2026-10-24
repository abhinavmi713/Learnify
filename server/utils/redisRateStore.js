const { MemoryStore } = require("express-rate-limit")
const { getRedis } = require("../config/redis")

// express-rate-limit store backed by Redis, so a limit holds across every API
// instance instead of each process counting on its own.
//
// Fixed-window counter: INCR the key and, on the first hit of a window, set its
// expiry, in one Lua script so the two steps are atomic (a crash between a
// separate INCR and EXPIRE would leave a counter that never resets).
//
// If Redis is unavailable the store transparently uses an in-process counter,
// i.e. limits keep working per instance rather than failing open or closed.
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {hits, ttl}
`

class RedisRateStore {
  constructor(prefix) {
    this.prefix = `rl:${prefix}:`
    this.fallback = new MemoryStore()
    // Keys are shared across instances when Redis is used.
    this.localKeys = false
  }

  init(options) {
    this.windowMs = options.windowMs
    this.fallback.init(options)
  }

  async increment(key) {
    const redis = getRedis()
    if (!redis) return this.fallback.increment(key)
    try {
      const [totalHits, ttl] = await redis.eval(INCREMENT, 1, this.prefix + key, this.windowMs)
      return { totalHits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) }
    } catch (error) {
      return this.fallback.increment(key)
    }
  }

  async decrement(key) {
    const redis = getRedis()
    if (!redis) return this.fallback.decrement(key)
    try {
      await redis.decr(this.prefix + key)
    } catch (error) {
      this.fallback.decrement(key)
    }
  }

  async resetKey(key) {
    const redis = getRedis()
    this.fallback.resetKey(key)
    if (!redis) return
    try {
      await redis.del(this.prefix + key)
    } catch (error) {
      /* best effort */
    }
  }
}

module.exports = { RedisRateStore }

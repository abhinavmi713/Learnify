const crypto = require("crypto")
const { promisify } = require("util")
const bcrypt = require("bcryptjs")

// Password hashing with scrypt from Node's own crypto module. Unlike bcryptjs
// (pure JavaScript), scrypt runs on libuv's thread pool, so hashing doesn't
// block the event loop and other requests keep being served meanwhile.
//
// Stored form: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
// Older bcrypt hashes ($2a$/$2b$) are still accepted, and replaced on the next
// successful login (needsRehash).
const scrypt = promisify(crypto.scrypt)
const PARAMS = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 32
// scrypt needs 128 * N * r bytes; allow some headroom.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(String(password), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAXMEM })
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`
}

async function verifyPassword(password, stored) {
  const value = String(stored || "")
  if (value.startsWith("$2")) return bcrypt.compare(String(password), value)
  const [scheme, N, r, p, salt, hash] = value.split("$")
  if (scheme !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const params = { N: Number(N), r: Number(r), p: Number(p) }
  const key = await scrypt(String(password), Buffer.from(salt, "base64"), expected.length, {
    ...params,
    maxmem: 128 * params.N * params.r * 2,
  })
  return crypto.timingSafeEqual(key, expected)
}

const needsRehash = (stored) => !String(stored || "").startsWith(`scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$`)

module.exports = { hashPassword, verifyPassword, needsRehash }

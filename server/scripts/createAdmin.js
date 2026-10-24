// Creates the first (or an additional) Admin account.
//
// Public signup deliberately refuses `accountType: "Admin"`, so this script is
// the only supported way to bootstrap one. It talks to the database directly
// and is safe to re-run: an existing admin is left untouched.
//
// Usage (from server/):
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' \
//   ADMIN_FIRST_NAME=Jane ADMIN_LAST_NAME=Doe npm run create-admin
//
// Add ADMIN_PROMOTE=true to promote an *existing* non-admin user instead.
require("dotenv").config()
const bcrypt = require("bcryptjs")
const mongoose = require("mongoose")
const User = require("../models/User")
const Profile = require("../models/Profile")

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ""
  const firstName = process.env.ADMIN_FIRST_NAME || "Admin"
  const lastName = process.env.ADMIN_LAST_NAME || "User"

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to a valid email address")
  }
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not set")

  await mongoose.connect(process.env.MONGODB_URL)

  const existing = await User.findOne({ email })
  if (existing) {
    if (existing.accountType === "Admin") {
      console.log(`Admin ${email} already exists — nothing to do.`)
      return
    }
    if (process.env.ADMIN_PROMOTE !== "true") {
      throw new Error(
        `${email} already exists as a ${existing.accountType}. Re-run with ADMIN_PROMOTE=true to promote it.`
      )
    }
    existing.accountType = "Admin"
    // Invalidate any tokens issued while it was a lower-privilege account.
    existing.tokenVersion = (existing.tokenVersion || 0) + 1
    await existing.save()
    console.log(`Promoted ${email} to Admin.`)
    return
  }

  if (password.length < 8) {
    throw new Error("Set ADMIN_PASSWORD to at least 8 characters")
  }

  const profile = await Profile.create({})
  await User.create({
    firstName,
    lastName,
    email,
    password: await bcrypt.hash(password, 10),
    accountType: "Admin",
    approved: true,
    additionalDetails: profile._id,
    image: "",
  })
  console.log(`Created Admin ${email}.`)
}

main()
  .catch((err) => {
    console.error(`create-admin failed: ${err.message}`)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())

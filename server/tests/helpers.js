const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Profile = require("../models/Profile")

async function createUser({ email, password = "Password123", accountType = "Student", active = true }) {
  const profile = await Profile.create({})
  const hashed = await bcrypt.hash(password, 10)
  const user = await User.create({
    firstName: "Test",
    lastName: accountType,
    email,
    password: hashed,
    accountType,
    active,
    additionalDetails: profile._id,
  })
  return user
}

function tokenFor(user) {
  return jwt.sign({ email: user.email, id: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  })
}

module.exports = { createUser, tokenFor }

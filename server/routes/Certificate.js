const express = require("express")
const router = express.Router()

const {
  getMyCertificates,
  verifyCertificate,
  downloadCertificate,
} = require("../controllers/Certificate")
const { auth } = require("../middleware/auth")

router.get("/mine", auth, getMyCertificates)
router.get("/download/:certificateId", auth, downloadCertificate)
// Public — no auth. Certificate verification must work for anyone checking
// a credential someone shows them, not just the logged-in owner.
router.get("/verify/:certificateId", verifyCertificate)

module.exports = router

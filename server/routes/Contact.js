const express = require("express")
const router = express.Router()
const { contactUsController } = require("../controllers/ContactUs")
const { contactLimiter } = require("../middleware/rateLimiter")
const { validate } = require("../middleware/validate")
const { contactFormSchema } = require("../validators/miscValidators")

router.post("/contact", contactLimiter, validate(contactFormSchema), contactUsController)

module.exports = router

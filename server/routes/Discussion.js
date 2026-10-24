const express = require("express")
const router = express.Router()

const {
  createDiscussion,
  getDiscussionsForSubsection,
  deleteDiscussion,
} = require("../controllers/Discussion")
const { auth } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { createDiscussionSchema, deleteDiscussionSchema } = require("../validators/miscValidators")

router.post("/create", auth, validate(createDiscussionSchema), createDiscussion)
router.get("/subsection", auth, getDiscussionsForSubsection)
router.post("/delete", auth, validate(deleteDiscussionSchema), deleteDiscussion)
module.exports = router

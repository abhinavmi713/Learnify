const express = require("express")
const router = express.Router()

const {
  createLiveClass,
  getInstructorLiveClasses,
  getStudentLiveClasses,
  deleteLiveClass,
} = require("../controllers/LiveClass")
const { auth, requirePermission } = require("../middleware/auth")
const { liveClassIdSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const { createLiveClassSchema } = require("../validators/liveClassValidators")

router.post("/create", auth, requirePermission("liveclass:host"), validate(createLiveClassSchema), createLiveClass)
router.get("/instructor", auth, requirePermission("liveclass:host"), getInstructorLiveClasses)
router.get("/student", auth, requirePermission("course:learn"), getStudentLiveClasses)
router.post("/delete", auth, requirePermission("liveclass:host"), validate(liveClassIdSchema), deleteLiveClass)
module.exports = router

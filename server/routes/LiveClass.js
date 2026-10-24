const express = require("express")
const router = express.Router()

const {
  createLiveClass,
  getInstructorLiveClasses,
  getStudentLiveClasses,
  deleteLiveClass,
} = require("../controllers/LiveClass")
const { auth, isInstructor, isStudent } = require("../middleware/auth")
const { liveClassIdSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const { createLiveClassSchema } = require("../validators/liveClassValidators")

router.post("/create", auth, isInstructor, validate(createLiveClassSchema), createLiveClass)
router.get("/instructor", auth, isInstructor, getInstructorLiveClasses)
router.get("/student", auth, isStudent, getStudentLiveClasses)
router.post("/delete", auth, isInstructor, validate(liveClassIdSchema), deleteLiveClass)
module.exports = router

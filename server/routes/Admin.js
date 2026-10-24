const express = require("express")
const router = express.Router()

const {
  getPendingCourses,
  approveCourse,
  rejectCourse,
  getArchivedCourses,
  restoreCourse,
  getAllUsersAdmin,
  setUserActive,
  getPlatformAnalytics,
} = require("../controllers/Admin")
const { auth, isAdmin } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { approveCourseSchema, rejectCourseSchema, setUserActiveSchema } = require("../validators/miscValidators")

router.use(auth, isAdmin)

router.get("/courses/pending", getPendingCourses)
router.post("/courses/approve", validate(approveCourseSchema), approveCourse)
router.post("/courses/reject", validate(rejectCourseSchema), rejectCourse)
router.get("/courses/archived", getArchivedCourses)
router.post("/courses/restore", validate(approveCourseSchema), restoreCourse)
router.get("/users", getAllUsersAdmin)
router.post("/users/set-active", validate(setUserActiveSchema), setUserActive)
router.get("/analytics", getPlatformAnalytics)

module.exports = router

const express = require("express")
const { emitContentChanged } = require("../utils/contentEvents")
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
  getAuditLogs,
} = require("../controllers/Admin")
const { auth, requirePermission } = require("../middleware/auth")
const { audited } = require("../utils/audit")
const { validate } = require("../middleware/validate")
const { approveCourseSchema, rejectCourseSchema, setUserActiveSchema } = require("../validators/miscValidators")

const course = (req) => ({ targetType: "course", targetId: req.body?.courseId })
const moderate = requirePermission("course:moderate")

router.use(auth)

router.get("/courses/pending", moderate, getPendingCourses)
router.post("/courses/approve", moderate, audited("admin.course_approve", course), emitContentChanged(), validate(approveCourseSchema), approveCourse)
router.post(
  "/courses/reject",
  moderate,
  audited("admin.course_reject", (req) => ({ ...course(req), metadata: { reason: req.body?.reason } })),
  emitContentChanged(),
  validate(rejectCourseSchema),
  rejectCourse
)
router.get("/courses/archived", moderate, getArchivedCourses)
router.post("/courses/restore", moderate, audited("admin.course_restore", course), emitContentChanged(), validate(approveCourseSchema), restoreCourse)
router.get("/users", requirePermission("user:read"), getAllUsersAdmin)
router.post(
  "/users/set-active",
  requirePermission("user:manage"),
  audited("admin.user_set_active", (req) => ({ targetType: "user", targetId: req.body?.userId, metadata: { active: Boolean(req.body?.active) } })),
  validate(setUserActiveSchema),
  setUserActive
)
router.get("/analytics", requirePermission("analytics:platform"), getPlatformAnalytics)
router.get("/audit-logs", requirePermission("audit:read"), getAuditLogs)

module.exports = router

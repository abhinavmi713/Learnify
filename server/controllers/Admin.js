const Course = require("../models/Course")
const { totalRevenue: totalRevenueCollected, revenueByMonth } = require("../utils/revenue")
const { invalidateCatalogCache } = require("../utils/cache")
const User = require("../models/User")
const CourseProgress = require("../models/CourseProgress")
const { notifyUser } = require("../utils/notify")
const { bucketByMonth } = require("../utils/analytics")
const { getPagination, buildPaginationMeta } = require("../utils/pagination")
const AuditLog = require("../models/AuditLog")
const mongoose = require("mongoose")
const { revokeAllSessions } = require("../utils/sessions")

// ********************************************************************************************************
//                                      Course moderation
// ********************************************************************************************************

// Courses submitted by instructors for review, awaiting approve/reject.
exports.getPendingCourses = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const filter = { status: "Pending" }

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .populate({ path: "instructor", select: "-password" })
        .populate("category")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Course.countDocuments(filter),
    ])

    return res
      .status(200)
      .json({ success: true, data: courses, pagination: buildPaginationMeta(total, page, limit) })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.approveCourse = async (req, res) => {
  try {
    const { courseId } = req.body
    const course = await Course.findById(courseId)

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" })
    }
    if (course.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only courses pending review can be approved",
      })
    }

    course.status = "Published"
    course.rejectionReason = undefined
    await course.save()
    invalidateCatalogCache()

    await notifyUser(
      course.instructor,
      `Your course "${course.courseName}" has been approved and is now live.`,
      `/dashboard/my-courses`
    )

    return res.status(200).json({
      success: true,
      message: "Course approved and published",
      data: course,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.rejectCourse = async (req, res) => {
  try {
    const { courseId, reason } = req.body
    const course = await Course.findById(courseId)

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" })
    }
    if (course.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only courses pending review can be rejected",
      })
    }

    course.status = "Draft"
    course.rejectionReason = reason || "No reason provided"
    await course.save()

    await notifyUser(
      course.instructor,
      `Your course "${course.courseName}" was not approved: ${course.rejectionReason}`,
      `/dashboard/edit-course/${course._id}`
    )

    return res.status(200).json({
      success: true,
      message: "Course rejected",
      data: course,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

// Courses an instructor deleted (soft-deleted). Admins can bring them back.
exports.getArchivedCourses = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const filter = { deletedAt: { $ne: null } }

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .populate({ path: "instructor", select: "firstName lastName email" })
        .populate("category", "name")
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit),
      Course.countDocuments(filter),
    ])

    return res
      .status(200)
      .json({ success: true, data: courses, pagination: buildPaginationMeta(total, page, limit) })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.restoreCourse = async (req, res) => {
  try {
    const { courseId } = req.body
    const course = await Course.findOne({ _id: courseId, deletedAt: { $ne: null } })

    if (!course) {
      return res.status(404).json({ success: false, message: "Archived course not found" })
    }

    course.deletedAt = null
    await course.save()
    invalidateCatalogCache()

    await notifyUser(
      course.instructor,
      `Your course "${course.courseName}" was restored by an admin.`,
      `/dashboard/my-courses`
    )

    return res.status(200).json({ success: true, message: "Course restored", data: course })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ********************************************************************************************************
//                                      User management
// ********************************************************************************************************

exports.getAllUsersAdmin = async (req, res) => {
  try {
    const { search = "", accountType } = req.query
    const { page, limit, skip } = getPagination(req.query)
    const filter = { deletedAt: null }

    if (accountType) {
      filter.accountType = accountType
    }
    if (search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(safe, "i")
      filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }]
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -token -resetPasswordToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ])

    return res
      .status(200)
      .json({ success: true, data: users, pagination: buildPaginationMeta(total, page, limit) })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

exports.setUserActive = async (req, res) => {
  try {
    const { userId, active } = req.body

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account",
      })
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { active: !!active },
      { new: true }
    ).select("-password -token -resetPasswordToken")

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }
    // Access tokens already stop working (auth checks `active`); this also ends
    // their refresh sessions so nothing lingers if they are re-activated.
    if (!active) await revokeAllSessions(user._id, "deactivated")

    return res.status(200).json({
      success: true,
      message: `User ${active ? "activated" : "deactivated"} successfully`,
      data: user,
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ********************************************************************************************************
//                                      Platform analytics
// ********************************************************************************************************

exports.getPlatformAnalytics = async (req, res) => {
  try {
    const [studentCount, instructorCount, adminCount] = await Promise.all([
      User.countDocuments({ accountType: "Student" }),
      User.countDocuments({ accountType: "Instructor" }),
      User.countDocuments({ accountType: "Admin" }),
    ])

    const courses = await Course.find({}, { status: 1, price: 1, studentsEnroled: 1, courseName: 1 })

    const coursesByStatus = { Draft: 0, Pending: 0, Published: 0 }
    let totalEnrollments = 0
    courses.forEach((course) => {
      if (course.status && coursesByStatus[course.status] !== undefined) {
        coursesByStatus[course.status] += 1
      }
      const enrolled = course.studentsEnroled?.length || 0
      totalEnrollments += enrolled
    })

    const topCourses = [...courses]
      .sort((a, b) => (b.studentsEnroled?.length || 0) - (a.studentsEnroled?.length || 0))
      .slice(0, 5)
      .map((c) => ({
        courseName: c.courseName,
        enrollments: c.studentsEnroled?.length || 0,
      }))

    // Enrollment trend from CourseProgress creation dates (one per enrollment);
    // revenue from the payments actually collected (after coupons, no refunds).
    const progressRecords = await CourseProgress.find({}, { createdAt: 1 })
    const enrollmentTrend = bucketByMonth(progressRecords.map((p) => p.createdAt))
    const [totalRevenue, revenueTrend] = await Promise.all([
      totalRevenueCollected(),
      revenueByMonth(enrollmentTrend.map((b) => b.month)),
    ])

    return res.status(200).json({
      success: true,
      data: {
        usersByRole: { Student: studentCount, Instructor: instructorCount, Admin: adminCount },
        coursesByStatus,
        totalEnrollments,
        totalRevenue,
        topCourses,
        enrollmentTrend,
        revenueTrend,
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

// ********************************************************************************************************
//                                      Audit log
// ********************************************************************************************************

// Newest first, keyset ("cursor") pagination: `?before=<id of the last row seen>`.
// Unlike skip/limit this stays fast however deep you page, and rows inserted
// while paging do not shift the pages.
exports.getAuditLogs = async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25))
  const filter = {}
  if (req.query.action) filter.action = String(req.query.action)
  if (["success", "failure"].includes(req.query.outcome)) filter.outcome = req.query.outcome
  if (req.query.actor) filter.actorEmail = String(req.query.actor).trim().toLowerCase()
  if (req.query.before) {
    if (!mongoose.isValidObjectId(req.query.before)) {
      return res.status(400).json({ success: false, message: "Invalid cursor" })
    }
    filter._id = { $lt: new mongoose.Types.ObjectId(String(req.query.before)) }
  }

  const rows = await AuditLog.find(filter).sort({ _id: -1 }).limit(limit + 1).lean()
  const hasMore = rows.length > limit
  const data = rows.slice(0, limit)
  const actions = await AuditLog.distinct("action")
  return res.status(200).json({
    success: true,
    data,
    nextCursor: hasMore ? String(data[data.length - 1]._id) : null,
    actions: actions.sort(),
  })
}

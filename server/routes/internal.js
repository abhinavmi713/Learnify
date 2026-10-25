const crypto = require("crypto")
const express = require("express")
const mongoose = require("mongoose")
const Course = require("../models/Course")

const router = express.Router()

// Service-to-service API for other Learnify services (the AI service). Not for
// browsers: every call must carry the shared INTERNAL_API_TOKEN, and nothing here
// is reachable without it. In production this path should also be blocked at the
// edge so only the private network can reach it.
function requireInternalToken(req, res, next) {
  const expected = process.env.INTERNAL_API_TOKEN
  if (!expected) return res.status(503).json({ success: false, message: "Internal API disabled" })
  const given = req.header("X-Internal-Token") || ""
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: "Unauthorized" })
  }
  next()
}

router.use(requireInternalToken)

// Everything the AI service indexes for one course.
router.get("/courses/:courseId/content", async (req, res) => {
  const { courseId } = req.params
  if (!mongoose.isValidObjectId(courseId)) return res.status(400).json({ success: false, message: "Invalid courseId" })
  const course = await Course.findById(courseId)
    .select("courseName courseDescription whatYouWillLearn status deletedAt courseContent")
    .populate({ path: "courseContent", select: "sectionName subSection", populate: { path: "subSection", select: "title description transcript" } })
    .lean()
  if (!course) return res.status(404).json({ success: false, message: "Course not found" })

  return res.json({
    success: true,
    data: {
      courseId: String(course._id),
      courseName: course.courseName,
      courseDescription: course.courseDescription,
      whatYouWillLearn: course.whatYouWillLearn,
      // Only published, non-archived courses should be searchable.
      searchable: course.status === "Published" && !course.deletedAt,
      sections: (course.courseContent || []).map((s) => ({
        sectionId: String(s._id),
        sectionName: s.sectionName,
        lectures: (s.subSection || []).map((l) => ({
          subSectionId: String(l._id),
          title: l.title,
          description: l.description || "",
          transcript: l.transcript || "",
        })),
      })),
    },
  })
})

// Ids of every course that should be in the search index (for a full rebuild).
router.get("/courses", async (req, res) => {
  const courses = await Course.find({ status: "Published", deletedAt: null }).select("_id").lean()
  return res.json({ success: true, data: courses.map((c) => String(c._id)) })
})

module.exports = router

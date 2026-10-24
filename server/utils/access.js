const mongoose = require("mongoose")
const Course = require("../models/Course")
const Section = require("../models/Section")
const LiveClass = require("../models/LiveClass")

// Who may see a course's interactive content (lecture discussions, live-class
// chat): its enrolled students, its instructor, and admins.
function isCourseParticipant(course, user) {
  if (!course || !user) return false
  if (user.accountType === "Admin") return true
  const id = String(user.id || user._id)
  if (String(course.instructor) === id) return true
  return (course.studentsEnroled || []).some((s) => String(s) === id)
}

// The course a lecture (sub-section) belongs to, or null.
async function findCourseForSubsection(subsectionId) {
  if (!mongoose.isValidObjectId(subsectionId)) return null
  const section = await Section.findOne({ subSection: subsectionId }).select("_id")
  if (!section) return null
  return Course.findOne({ courseContent: section._id, deletedAt: null }).select("instructor studentsEnroled courseName")
}

// Resolves to the course if `user` may take part in this lecture, else null.
async function lectureAccess(user, subsectionId) {
  const course = await findCourseForSubsection(subsectionId)
  return isCourseParticipant(course, user) ? course : null
}

// Resolves to the live class if `user` may join its room, else null.
async function liveClassAccess(user, liveClassId) {
  if (!mongoose.isValidObjectId(liveClassId)) return null
  const liveClass = await LiveClass.findById(liveClassId)
  if (!liveClass) return null
  const course = await Course.findById(liveClass.course).select("instructor studentsEnroled")
  return isCourseParticipant(course, user) ? liveClass : null
}

module.exports = { isCourseParticipant, findCourseForSubsection, lectureAccess, liveClassAccess }

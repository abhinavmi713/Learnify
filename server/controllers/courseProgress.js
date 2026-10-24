const mongoose = require("mongoose")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const CourseProgress = require("../models/CourseProgress")
const Course = require("../models/Course")
const { checkAndIssueCertificate } = require("../utils/certificate")

exports.updateCourseProgress = async (req, res) => {
  const { courseId, subsectionId } = req.body
  const userId = req.user.id

  if (
    !courseId ||
    !subsectionId ||
    !mongoose.isValidObjectId(courseId) ||
    !mongoose.isValidObjectId(subsectionId)
  ) {
    return res.status(400).json({ error: "Invalid or missing courseId/subsectionId" })
  }

  try {
    // Check if the subsection is valid
    const subsection = await SubSection.findById(subsectionId)
    if (!subsection) {
      return res.status(404).json({ error: "Invalid subsection" })
    }

    // Find the course progress document for the user and course
    let courseProgress = await CourseProgress.findOne({
      courseID: courseId,
      userId: userId,
    })

    if (!courseProgress) {
      // If course progress doesn't exist, create a new one
      return res.status(404).json({
        success: false,
        message: "Course progress Does Not Exist",
      })
    } else {
      // If course progress exists, check if the subsection is already completed
      if (courseProgress.completedVideos.includes(subsectionId)) {
        return res.status(400).json({ error: "Subsection already completed" })
      }

      // Push the subsection into the completedVideos array
      courseProgress.completedVideos.push(subsectionId)
    }

    // Save the updated course progress
    await courseProgress.save()

    // Watching the last lecture might be the final requirement for a
    // certificate (if the course has no quizzes, or they're already passed).
    const certificate = await checkAndIssueCertificate(userId, courseId)

    return res.status(200).json({
      message: "Course progress updated",
      certificateIssued: !!certificate,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Internal server error" })
  }
}

// Persist the student's current playback position for a subsection, so the
// player can resume from here instead of always restarting at 0. Called
// periodically (throttled client-side) during playback, not on every frame.
exports.updateWatchPosition = async (req, res) => {
  const { courseId, subsectionId, position } = req.body
  const userId = req.user.id

  if (
    !courseId ||
    !subsectionId ||
    !mongoose.isValidObjectId(courseId) ||
    !mongoose.isValidObjectId(subsectionId) ||
    typeof position !== "number" ||
    !Number.isFinite(position) ||
    position < 0
  ) {
    return res.status(400).json({ error: "Invalid or missing courseId/subsectionId/position" })
  }

  try {
    const courseProgress = await CourseProgress.findOne({
      courseID: courseId,
      userId,
    })
    if (!courseProgress) {
      return res.status(404).json({
        success: false,
        message: "Course progress does not exist",
      })
    }

    const existing = courseProgress.lastWatchedPositions.find(
      (p) => p.subsection.toString() === subsectionId
    )
    if (existing) {
      existing.position = position
      existing.updatedAt = new Date()
    } else {
      courseProgress.lastWatchedPositions.push({ subsection: subsectionId, position })
    }

    await courseProgress.save()
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Internal server error" })
  }
}

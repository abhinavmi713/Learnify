const mongoose = require("mongoose")
const LiveClass = require("../models/LiveClass")
const Course = require("../models/Course")
const { notifyUser } = require("../utils/notify")

async function assertOwnsCourse(courseId, userId) {
  const course = await Course.findById(courseId)
  if (!course) return { error: "Course not found", status: 404 }
  if (course.instructor.toString() !== userId) {
    return { error: "You are not authorized to manage this course", status: 403 }
  }
  return { course }
}

// Instructor: schedule a live class for a course they own.
exports.createLiveClass = async (req, res) => {
  try {
    const { courseId, title, description, meetingLink, scheduledAt } = req.body

    if (
      !courseId ||
      !mongoose.isValidObjectId(courseId) ||
      !title?.trim() ||
      !meetingLink?.trim() ||
      !scheduledAt ||
      Number.isNaN(new Date(scheduledAt).getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "courseId, title, meetingLink and scheduledAt are required",
      })
    }

    const { error, status, course } = await assertOwnsCourse(courseId, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    const liveClass = await LiveClass.create({
      course: courseId,
      title: title.trim(),
      description: description?.trim(),
      meetingLink: meetingLink.trim(),
      scheduledAt: new Date(scheduledAt),
    })

    // Best-effort notify enrolled students — a failed notification never
    // blocks the class from being scheduled.
    Promise.all(
      course.studentsEnroled.map((studentId) =>
        notifyUser(
          studentId,
          `A new live class "${liveClass.title}" was scheduled for "${course.courseName}"`,
          `/dashboard/live-classes`
        )
      )
    ).catch(() => {})

    return res.status(201).json({ success: true, data: liveClass })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to schedule live class" })
  }
}

// Instructor: all upcoming live classes across every course they teach.
exports.getInstructorLiveClasses = async (req, res) => {
  try {
    const courses = await Course.find({ instructor: req.user.id }).select("_id")
    const liveClasses = await LiveClass.find({ course: { $in: courses.map((c) => c._id) } })
      .populate({ path: "course", select: "courseName" })
      .sort({ scheduledAt: 1 })
    return res.status(200).json({ success: true, data: liveClasses })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch live classes" })
  }
}

// Student: all upcoming live classes across every course they're enrolled in.
exports.getStudentLiveClasses = async (req, res) => {
  try {
    const courses = await Course.find({
      studentsEnroled: { $elemMatch: { $eq: req.user.id } },
    }).select("_id")
    const liveClasses = await LiveClass.find({ course: { $in: courses.map((c) => c._id) } })
      .populate({ path: "course", select: "courseName" })
      .sort({ scheduledAt: 1 })
    return res.status(200).json({ success: true, data: liveClasses })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch live classes" })
  }
}

exports.deleteLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.body
    if (!liveClassId || !mongoose.isValidObjectId(liveClassId)) {
      return res.status(400).json({ success: false, message: "Invalid liveClassId" })
    }

    const liveClass = await LiveClass.findById(liveClassId)
    if (!liveClass) return res.status(404).json({ success: false, message: "Not found" })

    const { error, status } = await assertOwnsCourse(liveClass.course, req.user.id)
    if (error) return res.status(status).json({ success: false, message: error })

    await LiveClass.findByIdAndDelete(liveClassId)
    return res.status(200).json({ success: true, message: "Live class cancelled" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to cancel live class" })
  }
}

const mongoose = require("mongoose")
const Discussion = require("../models/Discussion")
const Course = require("../models/Course")
const User = require("../models/User")
const { notifyUser } = require("../utils/notify")
const { emitToRoom } = require("../realtime")
const { lectureAccess } = require("../utils/access")

// A question/reply is only meaningful for a course the user is enrolled in
// OR the instructor who owns it — either can participate in the thread.
async function assertParticipant(courseId, userId) {
  const course = await Course.findById(courseId)
  if (!course) return { error: "Course not found", status: 404 }
  const isEnrolled = course.studentsEnroled.some((id) => id.toString() === userId)
  const isOwner = course.instructor.toString() === userId
  if (!isEnrolled && !isOwner) {
    return { error: "You must be enrolled in this course to join the discussion", status: 403 }
  }
  return { course }
}

exports.createDiscussion = async (req, res) => {
  try {
    const { courseId, subsectionId, text, parentId } = req.body
    const userId = req.user.id

    if (
      !courseId ||
      !subsectionId ||
      !mongoose.isValidObjectId(courseId) ||
      !mongoose.isValidObjectId(subsectionId) ||
      !text ||
      typeof text !== "string" ||
      !text.trim()
    ) {
      return res.status(400).json({ success: false, message: "Invalid discussion data" })
    }

    const { error, status, course } = await assertParticipant(courseId, userId)
    if (error) return res.status(status).json({ success: false, message: error })

    let parent = null
    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) {
        return res.status(400).json({ success: false, message: "Invalid parentId" })
      }
      parent = await Discussion.findById(parentId)
      if (!parent || parent.course.toString() !== courseId) {
        return res.status(404).json({ success: false, message: "Question not found" })
      }
      if (parent.parent) {
        return res.status(400).json({ success: false, message: "Cannot reply to a reply" })
      }
    }

    const discussion = await Discussion.create({
      course: courseId,
      subsection: subsectionId,
      user: userId,
      text: text.trim(),
      parent: parent?._id || null,
    })

    // Notify the original asker when someone else replies to their question.
    if (parent && parent.user.toString() !== userId) {
      await notifyUser(
        parent.user,
        `Someone replied to your question on "${course.courseName}"`,
        `/view-course/${courseId}/section/${req.body.sectionId || ""}/sub-section/${subsectionId}`
      )
    }

    const populated = await discussion.populate({ path: "user", select: "firstName lastName accountType" })
    // Everyone else watching this lecture sees the new question/answer live.
    emitToRoom(`lecture:${subsectionId}`, "discussion:new", populated.toObject())
    return res.status(201).json({ success: true, data: populated })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to post" })
  }
}

exports.getDiscussionsForSubsection = async (req, res) => {
  try {
    const { subsectionId } = req.query
    if (!subsectionId || !mongoose.isValidObjectId(subsectionId)) {
      return res.status(400).json({ success: false, message: "Invalid subsectionId" })
    }

    // Reading a lecture's Q&A requires the same access as taking part in it
    // (previously any logged-in user could read any course's discussion).
    const viewer = await User.findById(req.user.id).select("accountType")
    const course = await lectureAccess({ id: req.user.id, accountType: viewer?.accountType }, subsectionId)
    if (!course) {
      return res.status(403).json({ success: false, message: "You must be enrolled in this course to view its discussion" })
    }

    const all = await Discussion.find({ subsection: subsectionId })
      .populate({ path: "user", select: "firstName lastName accountType" })
      .sort({ createdAt: 1 })

    const questions = all.filter((d) => !d.parent)
    const repliesByParent = {}
    all
      .filter((d) => d.parent)
      .forEach((r) => {
        const key = r.parent.toString()
        if (!repliesByParent[key]) repliesByParent[key] = []
        repliesByParent[key].push(r)
      })

    const data = questions.map((q) => ({
      ...q.toObject(),
      replies: repliesByParent[q._id.toString()] || [],
    }))

    return res.status(200).json({ success: true, data })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch discussion" })
  }
}

exports.deleteDiscussion = async (req, res) => {
  try {
    const { discussionId } = req.body
    const userId = req.user.id

    if (!discussionId || !mongoose.isValidObjectId(discussionId)) {
      return res.status(400).json({ success: false, message: "Invalid discussionId" })
    }

    const discussion = await Discussion.findById(discussionId)
    if (!discussion) {
      return res.status(404).json({ success: false, message: "Not found" })
    }

    const course = await Course.findById(discussion.course).select("instructor")
    const isAuthor = discussion.user.toString() === userId
    const isCourseInstructor = course?.instructor?.toString() === userId
    if (!isAuthor && !isCourseInstructor) {
      return res.status(403).json({ success: false, message: "You are not authorized to delete this" })
    }

    // Deleting a question also removes its replies so nothing is orphaned.
    await Discussion.deleteMany({ $or: [{ _id: discussionId }, { parent: discussionId }] })
    emitToRoom(`lecture:${discussion.subsection}`, "discussion:deleted", {
      id: String(discussion._id),
      parentId: discussion.parent ? String(discussion.parent) : null,
    })
    return res.status(200).json({ success: true, message: "Deleted" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to delete" })
  }
}

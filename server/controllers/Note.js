const mongoose = require("mongoose")
const Note = require("../models/Note")
const Course = require("../models/Course")

// Notes are only meaningful for a course the student is actually enrolled in.
async function assertEnrolled(courseId, userId) {
  const course = await Course.findOne({
    _id: courseId,
    studentsEnroled: { $elemMatch: { $eq: userId } },
  })
  return !!course
}

exports.createNote = async (req, res) => {
  try {
    const { courseId, subsectionId, timestamp, text } = req.body
    const userId = req.user.id

    if (
      !courseId ||
      !subsectionId ||
      !mongoose.isValidObjectId(courseId) ||
      !mongoose.isValidObjectId(subsectionId) ||
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp < 0 ||
      !text ||
      typeof text !== "string" ||
      !text.trim()
    ) {
      return res.status(400).json({ success: false, message: "Invalid note data" })
    }

    if (!(await assertEnrolled(courseId, userId))) {
      return res.status(403).json({
        success: false,
        message: "You must be enrolled in this course to add notes",
      })
    }

    const note = await Note.create({
      user: userId,
      course: courseId,
      subsection: subsectionId,
      timestamp,
      text: text.trim(),
    })

    return res.status(201).json({ success: true, data: note })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to create note" })
  }
}

exports.getNotesForSubsection = async (req, res) => {
  try {
    const { subsectionId } = req.query
    const userId = req.user.id

    if (!subsectionId || !mongoose.isValidObjectId(subsectionId)) {
      return res.status(400).json({ success: false, message: "Invalid subsectionId" })
    }

    const notes = await Note.find({ subsection: subsectionId, user: userId }).sort({
      timestamp: 1,
    })
    return res.status(200).json({ success: true, data: notes })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch notes" })
  }
}

exports.deleteNote = async (req, res) => {
  try {
    const { noteId } = req.body
    const userId = req.user.id

    if (!noteId || !mongoose.isValidObjectId(noteId)) {
      return res.status(400).json({ success: false, message: "Invalid noteId" })
    }

    const note = await Note.findById(noteId)
    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found" })
    }
    if (note.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this note",
      })
    }

    await Note.findByIdAndDelete(noteId)
    return res.status(200).json({ success: true, message: "Note deleted" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to delete note" })
  }
}

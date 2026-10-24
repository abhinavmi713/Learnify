const mongoose = require("mongoose")
const LearningPath = require("../models/LearningPath")
const { getPagination, buildPaginationMeta } = require("../utils/pagination")

exports.createLearningPath = async (req, res) => {
  try {
    const { title, description, courses } = req.body
    if (!title?.trim() || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "title and at least one course are required",
      })
    }
    if (!courses.every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: "Invalid course id in list" })
    }

    const path = await LearningPath.create({
      title: title.trim(),
      description: description?.trim(),
      courses,
    })
    return res.status(201).json({ success: true, data: path })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to create learning path" })
  }
}

exports.updateLearningPath = async (req, res) => {
  try {
    const { pathId, title, description, courses } = req.body
    if (!pathId || !mongoose.isValidObjectId(pathId)) {
      return res.status(400).json({ success: false, message: "Invalid pathId" })
    }
    if (courses && !courses.every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: "Invalid course id in list" })
    }

    const update = {}
    if (title !== undefined) update.title = title.trim()
    if (description !== undefined) update.description = description.trim()
    if (courses !== undefined) update.courses = courses

    const path = await LearningPath.findByIdAndUpdate(pathId, update, { new: true })
    if (!path) return res.status(404).json({ success: false, message: "Learning path not found" })

    return res.status(200).json({ success: true, data: path })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to update learning path" })
  }
}

exports.deleteLearningPath = async (req, res) => {
  try {
    const { pathId } = req.body
    if (!pathId || !mongoose.isValidObjectId(pathId)) {
      return res.status(400).json({ success: false, message: "Invalid pathId" })
    }
    await LearningPath.findByIdAndDelete(pathId)
    return res.status(200).json({ success: true, message: "Learning path deleted" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to delete learning path" })
  }
}

exports.getAllLearningPaths = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query)
    const [paths, total] = await Promise.all([
      LearningPath.find()
        .populate({ path: "courses", select: "courseName thumbnail price" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      LearningPath.countDocuments(),
    ])
    return res
      .status(200)
      .json({ success: true, data: paths, pagination: buildPaginationMeta(total, page, limit) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch learning paths" })
  }
}

exports.getLearningPathDetails = async (req, res) => {
  try {
    const { pathId } = req.params
    if (!pathId || !mongoose.isValidObjectId(pathId)) {
      return res.status(400).json({ success: false, message: "Invalid pathId" })
    }
    const path = await LearningPath.findById(pathId).populate({
      path: "courses",
      select: "courseName courseDescription thumbnail price instructor",
      populate: { path: "instructor", select: "firstName lastName" },
    })
    if (!path) return res.status(404).json({ success: false, message: "Learning path not found" })

    return res.status(200).json({ success: true, data: path })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch learning path" })
  }
}

const Section = require("../models/Section")
const Course = require("../models/Course")
const SubSection = require("../models/Subsection")
const { runInTransaction } = require("../utils/transaction")

// Owning a course says nothing about a section id sent alongside it, so check that
// the section is really part of that course.
const belongsToCourse = (course, sectionId) =>
  course.courseContent.some((id) => id.toString() === String(sectionId))
const sectionNotFound = (res) => res.status(404).json({ success: false, message: "Section not found" })

// CREATE a new section
exports.createSection = async (req, res) => {
  try {
    // Extract the required properties from the request body
    const { sectionName, courseId } = req.body

    // Validate the input
    if (!sectionName || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Missing required properties",
      })
    }

    // Only the instructor who owns this course may add sections to it
    const ownedCourse = await Course.findById(courseId)
    if (!ownedCourse) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      })
    }
    if (ownedCourse.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this course",
      })
    }

    // Create a new section with the given name
    // Together, so a failure can't leave a section no course points to.
    await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      const [newSection] = await Section.create([{ sectionName }], opts)
      await Course.findByIdAndUpdate(courseId, { $push: { courseContent: newSection._id } }, opts)
    })

    const updatedCourse = await Course.findById(courseId)
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
        },
      })
      .exec()

    // Return the updated course object in the response
    res.status(200).json({
      success: true,
      message: "Section created successfully",
      updatedCourse,
    })
  } catch (error) {
    console.error(error)
    // Handle errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

// UPDATE a section
exports.updateSection = async (req, res) => {
  try {
    const { sectionName, sectionId, courseId } = req.body

    if (!sectionId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Missing required properties",
      })
    }

    // Only the instructor who owns this course may update its sections
    const ownedCourse = await Course.findById(courseId)
    if (!ownedCourse) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      })
    }
    if (ownedCourse.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this course",
      })
    }

    if (!belongsToCourse(ownedCourse, sectionId)) return sectionNotFound(res)

    const section = await Section.findByIdAndUpdate(
      sectionId,
      { sectionName },
      { new: true }
    )
    const course = await Course.findById(courseId)
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
        },
      })
      .exec()
    console.log(course)
    res.status(200).json({
      success: true,
      message: section,
      data: course,
    })
  } catch (error) {
    console.error("Error updating section:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

// DELETE a section
exports.deleteSection = async (req, res) => {
  try {
    const { sectionId, courseId } = req.body

    if (!sectionId || !courseId) {
      return res.status(400).json({
        success: false,
        message: "Missing required properties",
      })
    }

    // Only the instructor who owns this course may delete its sections
    const ownedCourse = await Course.findById(courseId)
    if (!ownedCourse) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      })
    }
    if (ownedCourse.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this course",
      })
    }

    if (!belongsToCourse(ownedCourse, sectionId)) return sectionNotFound(res)
    const section = await Section.findById(sectionId)
    if (!section) return sectionNotFound(res)

    await runInTransaction(async (session) => {
      const opts = session ? { session } : {}
      await Course.findByIdAndUpdate(courseId, { $pull: { courseContent: sectionId } }, opts)
      await SubSection.deleteMany({ _id: { $in: section.subSection } }, opts)
      await Section.findByIdAndDelete(sectionId, opts)
    })

    // find the updated course and return it
    const course = await Course.findById(courseId)
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
        },
      })
      .exec()

    res.status(200).json({
      success: true,
      message: "Section deleted",
      data: course,
    })
  } catch (error) {
    console.error("Error deleting section:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

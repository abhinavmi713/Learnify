// Import necessary modules
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const Course = require("../models/Course")
const { uploadImageToCloudinary } = require("../utils/imageUploader")
const { isTrustedVideoUrl } = require("../utils/cloudinarySigner")

// Resolve the course that owns a given section and verify the requesting
// user is that course's instructor. Returns the course, or null after
// having already sent an error response.
async function authorizeSectionOwner(req, res, sectionId) {
  const course = await Course.findOne({ courseContent: sectionId })
  if (!course) {
    res.status(404).json({ success: false, message: "Section not found" })
    return null
  }
  if (course.instructor.toString() !== req.user.id) {
    res.status(403).json({
      success: false,
      message: "You are not authorized to modify this course",
    })
    return null
  }
  return course
}

// Create a new sub-section for a given section
exports.createSubSection = async (req, res) => {
  try {
    // Extract necessary information from the request body
    const { sectionId, title, description, videoUrl, duration } = req.body
    const video = req.files && req.files.video

    // Check if all necessary fields are provided. The video arrives either as
    // a file (uploaded through this server) or — what the app does — as the
    // URL of a video the browser already uploaded straight to Cloudinary.
    if (!sectionId || !title || !description || (!video && !videoUrl)) {
      return res
        .status(400)
        .json({ success: false, message: "All Fields are Required" })
    }
    if (videoUrl && !isTrustedVideoUrl(videoUrl)) {
      return res.status(400).json({ success: false, message: "Invalid video URL" })
    }

    if (!(await authorizeSectionOwner(req, res, sectionId))) return

    let secureUrl = videoUrl
    let timeDuration = `${Number(duration) || 0}`
    if (video) {
      const uploadDetails = await uploadImageToCloudinary(
        video,
        process.env.FOLDER_NAME
      )
      secureUrl = uploadDetails.secure_url
      timeDuration = `${uploadDetails.duration}`
    }
    // Create a new sub-section with the necessary information
    const SubSectionDetails = await SubSection.create({
      title: title,
      timeDuration,
      description: description,
      videoUrl: secureUrl,
    })

    // Update the corresponding section with the newly created sub-section
    const updatedSection = await Section.findByIdAndUpdate(
      { _id: sectionId },
      { $push: { subSection: SubSectionDetails._id } },
      { new: true }
    ).populate("subSection")

    // Return the updated section in the response
    return res.status(200).json({ success: true, data: updatedSection })
  } catch (error) {
    // Handle any errors that may occur during the process
    console.error("Error creating new sub-section:", error)
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
}

exports.updateSubSection = async (req, res) => {
  try {
    const { sectionId, subSectionId, title, description, videoUrl, duration } = req.body

    if (!sectionId || !subSectionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required properties",
      })
    }

    if (!(await authorizeSectionOwner(req, res, sectionId))) return

    const subSection = await SubSection.findById(subSectionId)

    if (!subSection) {
      return res.status(404).json({
        success: false,
        message: "SubSection not found",
      })
    }

    if (title !== undefined) {
      subSection.title = title
    }

    if (description !== undefined) {
      subSection.description = description
    }
    if (videoUrl !== undefined) {
      if (!isTrustedVideoUrl(videoUrl)) {
        return res.status(400).json({ success: false, message: "Invalid video URL" })
      }
      subSection.videoUrl = videoUrl
      subSection.timeDuration = `${Number(duration) || 0}`
    } else if (req.files && req.files.video !== undefined) {
      const video = req.files.video
      const uploadDetails = await uploadImageToCloudinary(
        video,
        process.env.FOLDER_NAME
      )
      subSection.videoUrl = uploadDetails.secure_url
      subSection.timeDuration = `${uploadDetails.duration}`
    }

    await subSection.save()

    // find updated section and return it
    const updatedSection = await Section.findById(sectionId).populate(
      "subSection"
    )

    console.log("updated section", updatedSection)

    return res.json({
      success: true,
      message: "Section updated successfully",
      data: updatedSection,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the section",
    })
  }
}

exports.deleteSubSection = async (req, res) => {
  try {
    const { subSectionId, sectionId } = req.body

    if (!sectionId || !subSectionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required properties",
      })
    }

    if (!(await authorizeSectionOwner(req, res, sectionId))) return

    await Section.findByIdAndUpdate(
      { _id: sectionId },
      {
        $pull: {
          subSection: subSectionId,
        },
      }
    )
    const subSection = await SubSection.findByIdAndDelete({ _id: subSectionId })

    if (!subSection) {
      return res
        .status(404)
        .json({ success: false, message: "SubSection not found" })
    }

    // find updated section and return it
    const updatedSection = await Section.findById(sectionId).populate(
      "subSection"
    )

    return res.json({
      success: true,
      message: "SubSection deleted successfully",
      data: updatedSection,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the SubSection",
    })
  }
}

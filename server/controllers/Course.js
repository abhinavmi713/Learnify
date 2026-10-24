const Course = require("../models/Course")
const { invalidateCatalogCache } = require("../utils/cache")
const Category = require("../models/Category")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const User = require("../models/User")
const mongoose = require("mongoose")
const { uploadImageToCloudinary } = require("../utils/imageUploader")
const CourseProgress = require("../models/CourseProgress")
const { convertSecondsToDuration } = require("../utils/secToDuration")
const { callGemini, extractJson } = require("../utils/gemini")
const { signVideoUpload } = require("../utils/cloudinarySigner")
// Short-lived signed parameters so the browser can upload a lecture video
// directly to Cloudinary (see utils/cloudinarySigner.js).
exports.getUploadSignature = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: signVideoUpload() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Uploads are not configured" })
  }
}

// Function to create a new course
exports.createCourse = async (req, res) => {
  try {
    // Get user ID from request object
    const userId = req.user.id

    // Get all required fields from request body
    let {
      courseName,
      courseDescription,
      whatYouWillLearn,
      price,
      tag: _tag,
      category,
      status,
      instructions: _instructions,
    } = req.body
    // Get thumbnail image from request files
    const thumbnail = req.files.thumbnailImage

    // Convert the tag and instructions from stringified Array to Array
    const tag = JSON.parse(_tag)
    const instructions = JSON.parse(_instructions)

    console.log("tag", tag)
    console.log("instructions", instructions)

    // Check if any of the required fields are missing
    if (
      !courseName ||
      !courseDescription ||
      !whatYouWillLearn ||
      !price ||
      !tag.length ||
      !thumbnail ||
      !category ||
      !instructions.length
    ) {
      return res.status(400).json({
        success: false,
        message: "All Fields are Mandatory",
      })
    }
    if (!status || status === undefined) {
      status = "Draft"
    }
    // Check if the user is an instructor
    const instructorDetails = await User.findById(userId, {
      accountType: "Instructor",
    })

    if (!instructorDetails) {
      return res.status(404).json({
        success: false,
        message: "Instructor Details Not Found",
      })
    }

    // Check if the tag given is valid
    const categoryDetails = await Category.findById(category)
    if (!categoryDetails) {
      return res.status(404).json({
        success: false,
        message: "Category Details Not Found",
      })
    }
    // Upload the Thumbnail to Cloudinary
    const thumbnailImage = await uploadImageToCloudinary(
      thumbnail,
      process.env.FOLDER_NAME
    )
    console.log(thumbnailImage)
    // Create a new course with the given details
    const newCourse = await Course.create({
      courseName,
      courseDescription,
      instructor: instructorDetails._id,
      whatYouWillLearn: whatYouWillLearn,
      price,
      tag,
      category: categoryDetails._id,
      thumbnail: thumbnailImage.secure_url,
      status: status,
      instructions,
    })

    // Add the new course to the User Schema of the Instructor
    await User.findByIdAndUpdate(
      {
        _id: instructorDetails._id,
      },
      {
        $push: {
          courses: newCourse._id,
        },
      },
      { new: true }
    )
    // Add the new course to the Categories
    const categoryDetails2 = await Category.findByIdAndUpdate(
      { _id: category },
      {
        $push: {
          courses: newCourse._id,
        },
      },
      { new: true }
    )
    console.log("HEREEEEEEEE", categoryDetails2)
    invalidateCatalogCache()
    // Return the new course and a success message
    res.status(200).json({
      success: true,
      data: newCourse,
      message: "Course Created Successfully",
    })
  } catch (error) {
    // Handle any errors that occur during the creation of the course
    console.error(error)
    res.status(500).json({
      success: false,
      message: "Failed to create course",
      error: error.message,
    })
  }
}
// Edit Course Details
// Fields an instructor is allowed to change via editCourse.
// Anything else (e.g. instructor, studentsEnroled, ratingAndReviews, _id) must
// never be settable from the request body.
const EDITABLE_COURSE_FIELDS = [
  "courseName",
  "courseDescription",
  "whatYouWillLearn",
  "price",
  "category",
  "status",
]

exports.editCourse = async (req, res) => {
  try {
    const { courseId } = req.body
    const updates = req.body
    const course = await Course.findById(courseId)

    if (!course) {
      return res.status(404).json({ error: "Course not found" })
    }

    // Only the instructor who owns this course may edit it
    if (course.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to edit this course",
      })
    }

    // Instructors can save a Draft or submit for review (Pending), but only an
    // admin's approve action (see controllers/Admin.js) may set a course Published.
    if (updates.status === "Published") {
      return res.status(403).json({
        success: false,
        message: "Courses must be reviewed and approved by an admin before publishing",
      })
    }

    // If Thumbnail Image is found, update it
    if (req.files && req.files.thumbnailImage) {
      console.log("thumbnail update")
      const thumbnail = req.files.thumbnailImage
      const thumbnailImage = await uploadImageToCloudinary(
        thumbnail,
        process.env.FOLDER_NAME
      )
      course.thumbnail = thumbnailImage.secure_url
    }

    // Update only whitelisted fields present in the request body
    for (const key of EDITABLE_COURSE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        course[key] = updates[key]
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "tag")) {
      course.tag = JSON.parse(updates.tag)
    }
    if (Object.prototype.hasOwnProperty.call(updates, "instructions")) {
      course.instructions = JSON.parse(updates.instructions)
    }

    // A fresh submission clears any previous rejection note.
    if (updates.status === "Pending") {
      course.rejectionReason = undefined
    }

    await course.save()
    invalidateCatalogCache()

    const updatedCourse = await Course.findOne({
      _id: courseId,
    })
      .populate({
        path: "instructor",
        select: "firstName lastName image additionalDetails",
        populate: {
          path: "additionalDetails",
        },
      })
      .populate("category")
      .populate("ratingAndReviews")
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
        },
      })
      .exec()

    res.json({
      success: true,
      message: "Course updated successfully",
      data: updatedCourse,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
}
// AI-assist for instructors drafting a new course: given a title and a few
// topic keywords, draft a short description and a "what you'll learn"
// blurb for them to review/edit before saving. Nothing is persisted here.
exports.generateCourseDescription = async (req, res) => {
  try {
    const { courseTitle, topics } = req.body
    if (!courseTitle || !courseTitle.trim()) {
      return res.status(400).json({ success: false, message: "courseTitle is required" })
    }

    const prompt = `You are helping an instructor draft the listing copy for a new online course.
Course title: ${courseTitle.trim()}
${topics?.trim() ? `Key topics/keywords: ${topics.trim()}` : ""}

Write:
1. A short, engaging course description (2-4 sentences, plain text, no markdown).
2. A "what you'll learn" blurb (2-4 sentences, plain text, no markdown) describing the concrete skills/outcomes a student will walk away with.

Respond with ONLY a JSON object (no markdown fences, no prose before or after), in this exact shape:
{"courseDescription": "...", "whatYouWillLearn": "..."}`

    const text = await callGemini(prompt, { temperature: 0.6, maxOutputTokens: 1536 })

    let draft
    try {
      draft = extractJson(text)
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        message: "Could not parse the AI's response. Try again.",
      })
    }

    if (!draft.courseDescription || !draft.whatYouWillLearn) {
      return res.status(502).json({
        success: false,
        message: "AI response was missing expected fields. Try again.",
      })
    }

    return res.status(200).json({ success: true, data: draft })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate course description",
    })
  }
}

// Content-based recommendations for a logged-in student: published courses
// sharing a category or tag with courses they're already enrolled in,
// ranked by overlap and excluding courses they already have. Falls back to
// the newest published courses for students with no enrollment history yet.
exports.getRecommendedCourses = async (req, res) => {
  try {
    const userId = req.user.id
    const enrolledCourses = await Course.find({
      studentsEnroled: { $elemMatch: { $eq: userId } },
    }).select("category tag")

    const enrolledIds = enrolledCourses.map((c) => c._id)
    const categoryIds = [...new Set(enrolledCourses.map((c) => c.category?.toString()).filter(Boolean))]
    const tags = [...new Set(enrolledCourses.flatMap((c) => c.tag || []))]

    const baseMatch = {
      status: "Published",
      _id: { $nin: enrolledIds },
    }

    let recommended = []
    if (categoryIds.length > 0 || tags.length > 0) {
      recommended = await Course.aggregate([
        {
          $match: {
            ...baseMatch,
            $or: [
              { category: { $in: categoryIds.map((id) => new mongoose.Types.ObjectId(id)) } },
              { tag: { $in: tags } },
            ],
          },
        },
        {
          $addFields: {
            overlapScore: {
              $add: [
                { $cond: [{ $in: ["$category", categoryIds.map((id) => new mongoose.Types.ObjectId(id))] }, 2, 0] },
                { $size: { $setIntersection: ["$tag", tags] } },
              ],
            },
          },
        },
        { $sort: { overlapScore: -1, createdAt: -1 } },
        { $limit: 8 },
      ])
      recommended = await Course.populate(recommended, [
        { path: "instructor", select: "firstName lastName" },
        { path: "category", select: "name" },
      ])
    }

    // Not enough (or no) overlap-based matches yet — fill with newest published courses.
    if (recommended.length < 4) {
      const excludeIds = [...enrolledIds, ...recommended.map((c) => c._id)]
      const fallback = await Course.find({ status: "Published", _id: { $nin: excludeIds } })
        .sort({ createdAt: -1 })
        .limit(8 - recommended.length)
        .populate({ path: "instructor", select: "firstName lastName" })
        .populate({ path: "category", select: "name" })
      recommended = [...recommended, ...fallback]
    }

    return res.status(200).json({ success: true, data: recommended })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recommendations",
      error: error.message,
    })
  }
}

// Get Course List
exports.getAllCourses = async (req, res) => {
  try {
    const allCourses = await Course.find(
      { status: "Published", deletedAt: null },
      {
        courseName: true,
        price: true,
        thumbnail: true,
        instructor: true,
        ratingAndReviews: true,
        studentsEnrolled: true,
      }
    )
      .populate({ path: "instructor", select: "firstName lastName image additionalDetails" })
      .exec()

    return res.status(200).json({
      success: true,
      data: allCourses,
    })
  } catch (error) {
    console.log(error)
    return res.status(404).json({
      success: false,
      message: `Can't Fetch Course Data`,
      error: error.message,
    })
  }
}
// Get One Single Course Details
// exports.getCourseDetails = async (req, res) => {
//   try {
//     const { courseId } = req.body
//     const courseDetails = await Course.findOne({
//       _id: courseId,
//     })
//       .populate({
//         path: "instructor",
//         populate: {
//           path: "additionalDetails",
//         },
//       })
//       .populate("category")
//       .populate("ratingAndReviews")
//       .populate({
//         path: "courseContent",
//         populate: {
//           path: "subSection",
//         },
//       })
//       .exec()
//     // console.log(
//     //   "###################################### course details : ",
//     //   courseDetails,
//     //   courseId
//     // );
//     if (!courseDetails || !courseDetails.length) {
//       return res.status(400).json({
//         success: false,
//         message: `Could not find course with id: ${courseId}`,
//       })
//     }

//     if (courseDetails.status === "Draft") {
//       return res.status(403).json({
//         success: false,
//         message: `Accessing a draft course is forbidden`,
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       data: courseDetails,
//     })
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     })
//   }
// }
exports.getCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.body
    const courseDetails = await Course.findOne({
      _id: courseId,
      deletedAt: null,
    })
      .populate({
        path: "instructor",
        select: "firstName lastName image additionalDetails",
        populate: {
          path: "additionalDetails",
        },
      })
      .populate("category")
      .populate("ratingAndReviews")
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
          select: "-videoUrl",
        },
      })
      .exec()

    if (!courseDetails) {
      return res.status(400).json({
        success: false,
        message: `Could not find course with id: ${courseId}`,
      })
    }

    // if (courseDetails.status === "Draft") {
    //   return res.status(403).json({
    //     success: false,
    //     message: `Accessing a draft course is forbidden`,
    //   });
    // }

    let totalDurationInSeconds = 0
    courseDetails.courseContent.forEach((content) => {
      content.subSection.forEach((subSection) => {
        const timeDurationInSeconds = parseInt(subSection.timeDuration)
        totalDurationInSeconds += timeDurationInSeconds
      })
    })

    const totalDuration = convertSecondsToDuration(totalDurationInSeconds)

    return res.status(200).json({
      success: true,
      data: {
        courseDetails,
        totalDuration,
      },
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
exports.getFullCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.body
    const userId = req.user.id
    const courseDetails = await Course.findOne({
      _id: courseId,
    })
      .populate({
        path: "instructor",
        select: "firstName lastName image additionalDetails",
        populate: {
          path: "additionalDetails",
        },
      })
      .populate("category")
      .populate("ratingAndReviews")
      .populate({
        path: "courseContent",
        populate: {
          path: "subSection",
        },
      })
      .exec()

    let courseProgressCount = await CourseProgress.findOne({
      courseID: courseId,
      userId: userId,
    })

    console.log("courseProgressCount : ", courseProgressCount)

    if (!courseDetails) {
      return res.status(400).json({
        success: false,
        message: `Could not find course with id: ${courseId}`,
      })
    }

    // if (courseDetails.status === "Draft") {
    //   return res.status(403).json({
    //     success: false,
    //     message: `Accessing a draft course is forbidden`,
    //   });
    // }

    let totalDurationInSeconds = 0
    courseDetails.courseContent.forEach((content) => {
      content.subSection.forEach((subSection) => {
        const timeDurationInSeconds = parseInt(subSection.timeDuration)
        totalDurationInSeconds += timeDurationInSeconds
      })
    })

    const totalDuration = convertSecondsToDuration(totalDurationInSeconds)

    return res.status(200).json({
      success: true,
      data: {
        courseDetails,
        totalDuration,
        completedVideos: courseProgressCount?.completedVideos
          ? courseProgressCount?.completedVideos
          : [],
        lastWatchedPositions: courseProgressCount?.lastWatchedPositions || [],
      },
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

// Get a list of Course for a given Instructor
exports.getInstructorCourses = async (req, res) => {
  try {
    // Get the instructor ID from the authenticated user or request body
    const instructorId = req.user.id

    // Find all courses belonging to the instructor
    const instructorCourses = await Course.find({
      instructor: instructorId,
      deletedAt: null,
    }).sort({ createdAt: -1 })

    // Return the instructor's courses
    res.status(200).json({
      success: true,
      data: instructorCourses,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve instructor courses",
      error: error.message,
    })
  }
}
// Delete (archive) the Course
// This is a soft delete: the course, its sections/subsections, and every
// enrolled student's access are all left intact — the course just stops
// appearing in public discovery and the instructor's active course list.
// A permanent hard-delete with no recovery window was the previous
// behavior; this trades that for the ability to undo an accidental click
// (currently a manual `deletedAt: null` update — there's no restore UI yet).
exports.deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.body

    // Find the course
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({ message: "Course not found" })
    }

    // Only the instructor who owns this course may delete it
    if (course.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this course",
      })
    }

    course.deletedAt = new Date()
    await course.save()
    invalidateCatalogCache()

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Search & filter published courses: free-text search, category, price range,
// minimum rating, and sort — with pagination.
const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  priceLowHigh: { price: 1 },
  priceHighLow: { price: -1 },
  ratingHighLow: { avgRating: -1 },
}

exports.searchCourses = async (req, res) => {
  try {
    const {
      search = "",
      category,
      minPrice,
      maxPrice,
      minRating,
      sortBy = "newest",
      page = 1,
      limit = 12,
    } = req.body

    const match = { status: "Published", deletedAt: null }
    // MongoDB doesn't allow $text inside $or, so it can't just be added
    // alongside the regex match below — it has to be the query's sole
    // top-level text condition. Word-boundary searches ("javascript
    // basics") use the indexed, relevance-ranked $text search; anything
    // that isn't cleanly splittable into whole words (a partial term, a
    // single short token) falls back to the previous substring regex so
    // "java" -> "JavaScript" style matches still work.
    const searchTerm = typeof search === "string" ? search.trim() : ""
    const looksLikeWholeWords = searchTerm.length >= 3 && /\s/.test(searchTerm)

    if (searchTerm && looksLikeWholeWords) {
      match.$text = { $search: searchTerm }
    } else if (searchTerm) {
      const safe = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(safe, "i")
      match.$or = [{ courseName: regex }, { courseDescription: regex }, { tag: regex }]
    }

    if (category && mongoose.isValidObjectId(category)) {
      match.category = new mongoose.Types.ObjectId(category)
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      match.price = {}
      if (minPrice !== undefined && Number.isFinite(Number(minPrice))) {
        match.price.$gte = Number(minPrice)
      }
      if (maxPrice !== undefined && Number.isFinite(Number(maxPrice))) {
        match.price.$lte = Number(maxPrice)
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12))
    const sortStage = SORT_OPTIONS[sortBy] || SORT_OPTIONS.newest

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "ratingandreviews",
          localField: "ratingAndReviews",
          foreignField: "_id",
          as: "reviews",
        },
      },
      {
        $addFields: {
          avgRating: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
          ratingCount: { $size: "$reviews" },
        },
      },
    ]

    if (minRating !== undefined && Number.isFinite(Number(minRating))) {
      pipeline.push({ $match: { avgRating: { $gte: Number(minRating) } } })
    }

    pipeline.push(
      { $sort: sortStage },
      {
        $facet: {
          data: [
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum },
            { $project: { reviews: 0 } },
          ],
          totalCount: [{ $count: "count" }],
        },
      }
    )

    const [result] = await Course.aggregate(pipeline)
    const courses = result.data
    const total = result.totalCount[0]?.count || 0

    // Populate instructor + category on the paginated page only.
    const populated = await Course.populate(courses, [
      { path: "instructor", select: "firstName lastName" },
      { path: "category", select: "name" },
    ])

    return res.status(200).json({
      success: true,
      data: populated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Failed to search courses",
      error: error.message,
    })
  }
}

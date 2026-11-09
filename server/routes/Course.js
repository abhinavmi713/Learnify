// Import the required modules
const express = require("express")
const router = express.Router()

// Import the Controllers

// Course Controllers Import
const {
  createCourse,
  getAllCourses,
  getCourseDetails,
  getFullCourseDetails,
  editCourse,
  getInstructorCourses,
  deleteCourse,
  searchCourses,
  suggestCourses,
  generateCourseDescription,
  getRecommendedCourses,
  getUploadSignature,
} = require("../controllers/Course")

// Tags Controllers Import

// Categories Controllers Import
const {
  showAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  categoryPageDetails,
} = require("../controllers/Category")

// Sections Controllers Import
const {
  createSection,
  updateSection,
  deleteSection,
} = require("../controllers/Section")

// Sub-Sections Controllers Import
const {
  createSubSection,
  updateSubSection,
  deleteSubSection,
} = require("../controllers/Subsection")

// Rating Controllers Import
const {
  createRating,
  getAverageRating,
  getAllRatingReview,
} = require("../controllers/RatingandReview")
const {
  updateCourseProgress,
  updateWatchPosition,
} = require("../controllers/courseProgress")
// Importing Middlewares
const { optionalAuth, auth, requirePermission, requireAdmin2FA } = require("../middleware/auth")
const { audited } = require("../utils/audit")
const { idempotent } = require("../middleware/idempotency")
const { aiLimiter } = require("../middleware/rateLimiter")
const { cacheResponse } = require("../utils/cache")
const { uploadImage, uploadVideo } = require("../middleware/upload")
const { searchCoursesSchema, generateDescriptionSchema } = require("../validators/miscValidators")
const { emitContentChanged } = require("../utils/contentEvents")
const { courseIdSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const {
  createCourseSchema, editCourseSchema, addSectionSchema, updateSectionSchema, deleteSectionSchema,
  addSubSectionSchema, updateSubSectionSchema, deleteSubSectionSchema, createRatingSchema,
  lectureProgressSchema, watchPositionSchema, createCategorySchema, updateCategorySchema, categoryIdSchema,
} = require("../validators/courseValidators")

// ********************************************************************************************************
//                                      Course routes
// ********************************************************************************************************

// Courses can Only be Created by Instructors
// Validation runs before the idempotency check, so a rejected request is not
// stored against its key and the corrected one can be sent with the same key.
router.post("/createCourse", auth, requirePermission("course:author"), uploadImage, validate(createCourseSchema), idempotent(), createCourse)
// Edit Course routes
router.post("/editCourse", auth, requirePermission("course:author"), uploadImage, emitContentChanged(), validate(editCourseSchema), editCourse)
//Add a Section to a Course
router.post("/addSection", auth, requirePermission("course:author"), emitContentChanged(), validate(addSectionSchema), createSection)
// Update a Section
router.post("/updateSection", auth, requirePermission("course:author"), emitContentChanged(), validate(updateSectionSchema), updateSection)
// Delete a Section
router.post("/deleteSection", auth, requirePermission("course:author"), emitContentChanged(), validate(deleteSectionSchema), deleteSection)
// Edit Sub Section
router.post("/updateSubSection", auth, requirePermission("course:author"), uploadVideo, emitContentChanged(), validate(updateSubSectionSchema), updateSubSection)
// Delete Sub Section
router.post("/deleteSubSection", auth, requirePermission("course:author"), emitContentChanged(), validate(deleteSubSectionSchema), deleteSubSection)
// Add a Sub Section to a Section
router.post("/addSubSection", auth, requirePermission("course:author"), uploadVideo, emitContentChanged(), validate(addSubSectionSchema), createSubSection)
// Signed params for a direct browser -> Cloudinary video upload
router.post("/uploadSignature", auth, requirePermission("course:author"), getUploadSignature)
// Get all Courses Under a Specific Instructor
router.get("/getInstructorCourses", auth, requirePermission("course:author"), getInstructorCourses)
// Get all Registered Courses (cached briefly — this list changes rarely
// relative to how often it's fetched)
// Public, identical for everyone, and fine to be a minute old: let browsers and
// CDNs reuse it briefly instead of asking the server every time.
const publicCache = (seconds) => (req, res, next) => {
  res.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`)
  next()
}
router.get("/getAllCourses", publicCache(30), cacheResponse(60, { params: ["limit", "before"] }), getAllCourses)
// Search & filter courses (text search, category, price range, rating, sort, pagination)
// Popular searches repeat, so results are cached for 30 s. They share the
// catalog's version, so publishing or changing a course clears them at once.
router.post("/searchCourses", validate(searchCoursesSchema), cacheResponse(30, { body: true }), searchCourses)
// Search-box autocomplete: GET /suggest?q=jav
router.get("/suggest", suggestCourses)
// AI-assisted course description/benefits draft for instructors
router.post("/generateDescription", auth, requirePermission("course:author"), aiLimiter, validate(generateDescriptionSchema), generateCourseDescription)
// Content-based "recommended for you" courses for a logged-in student
router.get("/recommendations", auth, requirePermission("course:learn"), getRecommendedCourses)
// Get Details for a Specific Courses
router.post("/getCourseDetails", optionalAuth, validate(courseIdSchema), getCourseDetails)
// Get Details for a Specific Courses
router.post("/getFullCourseDetails", auth, validate(courseIdSchema), getFullCourseDetails)
// To Update Course Progress
router.post("/updateCourseProgress", auth, requirePermission("course:learn"), validate(lectureProgressSchema), updateCourseProgress)
// To save the student's current playback position (for resume-on-return)
router.post("/updateWatchPosition", auth, requirePermission("course:learn"), validate(watchPositionSchema), updateWatchPosition)
// Delete a Course
router.delete("/deleteCourse", auth, audited("course.archive", (req) => ({ targetType: "course", targetId: req.body?.courseId })), requirePermission("course:author"), emitContentChanged(), validate(courseIdSchema), deleteCourse)
// ********************************************************************************************************
//                                      Category routes (Only by Admin)
// ********************************************************************************************************
// Category can Only be Created by Admin
// TODO: Put IsAdmin Middleware here
const manageCategories = requirePermission("category:manage")
router.post("/createCategory", auth, requireAdmin2FA, audited("category.create", (req) => ({ targetType: "category", metadata: { name: req.body?.name } })), manageCategories, validate(createCategorySchema), createCategory)
router.post("/updateCategory", auth, requireAdmin2FA, audited("category.update", (req) => ({ targetType: "category", targetId: req.body?.categoryId })), manageCategories, validate(updateCategorySchema), updateCategory)
router.post("/deleteCategory", auth, requireAdmin2FA, audited("category.delete", (req) => ({ targetType: "category", targetId: req.body?.categoryId })), manageCategories, validate(categoryIdSchema), deleteCategory)
router.get("/showAllCategories", publicCache(60), cacheResponse(60, { params: [] }), showAllCategories)
router.post("/getCategoryPageDetails", validate(categoryIdSchema), categoryPageDetails)

// ********************************************************************************************************
//                                      Rating and Review
// ********************************************************************************************************
router.post("/createRating", auth, requirePermission("review:write"), validate(createRatingSchema), createRating)
router.get("/getAverageRating", getAverageRating)
router.get("/getReviews", getAllRatingReview)

module.exports = router

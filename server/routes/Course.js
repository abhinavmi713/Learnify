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
const { auth, isInstructor, isStudent, requirePermission } = require("../middleware/auth")
const { audited } = require("../utils/audit")
const { idempotent } = require("../middleware/idempotency")
const { aiLimiter } = require("../middleware/rateLimiter")
const { cacheResponse } = require("../utils/cache")
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
router.post("/createCourse", auth, isInstructor, idempotent(), validate(createCourseSchema), createCourse)
// Edit Course routes
router.post("/editCourse", auth, isInstructor, emitContentChanged(), validate(editCourseSchema), editCourse)
//Add a Section to a Course
router.post("/addSection", auth, isInstructor, emitContentChanged(), validate(addSectionSchema), createSection)
// Update a Section
router.post("/updateSection", auth, isInstructor, emitContentChanged(), validate(updateSectionSchema), updateSection)
// Delete a Section
router.post("/deleteSection", auth, isInstructor, emitContentChanged(), validate(deleteSectionSchema), deleteSection)
// Edit Sub Section
router.post("/updateSubSection", auth, isInstructor, emitContentChanged(), validate(updateSubSectionSchema), updateSubSection)
// Delete Sub Section
router.post("/deleteSubSection", auth, isInstructor, emitContentChanged(), validate(deleteSubSectionSchema), deleteSubSection)
// Add a Sub Section to a Section
router.post("/addSubSection", auth, isInstructor, emitContentChanged(), validate(addSubSectionSchema), createSubSection)
// Signed params for a direct browser -> Cloudinary video upload
router.post("/uploadSignature", auth, isInstructor, getUploadSignature)
// Get all Courses Under a Specific Instructor
router.get("/getInstructorCourses", auth, isInstructor, getInstructorCourses)
// Get all Registered Courses (cached briefly — this list changes rarely
// relative to how often it's fetched)
router.get("/getAllCourses", cacheResponse(60), getAllCourses)
// Search & filter courses (text search, category, price range, rating, sort, pagination)
router.post("/searchCourses", searchCourses)
// AI-assisted course description/benefits draft for instructors
router.post("/generateDescription", auth, isInstructor, aiLimiter, generateCourseDescription)
// Content-based "recommended for you" courses for a logged-in student
router.get("/recommendations", auth, isStudent, getRecommendedCourses)
// Get Details for a Specific Courses
router.post("/getCourseDetails", validate(courseIdSchema), getCourseDetails)
// Get Details for a Specific Courses
router.post("/getFullCourseDetails", auth, validate(courseIdSchema), getFullCourseDetails)
// To Update Course Progress
router.post("/updateCourseProgress", auth, isStudent, validate(lectureProgressSchema), updateCourseProgress)
// To save the student's current playback position (for resume-on-return)
router.post("/updateWatchPosition", auth, isStudent, validate(watchPositionSchema), updateWatchPosition)
// Delete a Course
router.delete("/deleteCourse", auth, isInstructor, emitContentChanged(), validate(courseIdSchema), deleteCourse)
// ********************************************************************************************************
//                                      Category routes (Only by Admin)
// ********************************************************************************************************
// Category can Only be Created by Admin
// TODO: Put IsAdmin Middleware here
const manageCategories = requirePermission("category:manage")
router.post("/createCategory", auth, manageCategories, audited("category.create", (req) => ({ targetType: "category", metadata: { name: req.body?.name } })), validate(createCategorySchema), createCategory)
router.post("/updateCategory", auth, manageCategories, audited("category.update", (req) => ({ targetType: "category", targetId: req.body?.categoryId })), validate(updateCategorySchema), updateCategory)
router.post("/deleteCategory", auth, manageCategories, audited("category.delete", (req) => ({ targetType: "category", targetId: req.body?.categoryId })), validate(categoryIdSchema), deleteCategory)
router.get("/showAllCategories", cacheResponse(60), showAllCategories)
router.post("/getCategoryPageDetails", categoryPageDetails)

// ********************************************************************************************************
//                                      Rating and Review
// ********************************************************************************************************
router.post("/createRating", auth, isStudent, validate(createRatingSchema), createRating)
router.get("/getAverageRating", getAverageRating)
router.get("/getReviews", getAllRatingReview)

module.exports = router

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
const { auth, isInstructor, isStudent, isAdmin } = require("../middleware/auth")
const { aiLimiter } = require("../middleware/rateLimiter")
const { cacheResponse } = require("../utils/cache")
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
router.post("/createCourse", auth, isInstructor, validate(createCourseSchema), createCourse)
// Edit Course routes
router.post("/editCourse", auth, isInstructor, validate(editCourseSchema), editCourse)
//Add a Section to a Course
router.post("/addSection", auth, isInstructor, validate(addSectionSchema), createSection)
// Update a Section
router.post("/updateSection", auth, isInstructor, validate(updateSectionSchema), updateSection)
// Delete a Section
router.post("/deleteSection", auth, isInstructor, validate(deleteSectionSchema), deleteSection)
// Edit Sub Section
router.post("/updateSubSection", auth, isInstructor, validate(updateSubSectionSchema), updateSubSection)
// Delete Sub Section
router.post("/deleteSubSection", auth, isInstructor, validate(deleteSubSectionSchema), deleteSubSection)
// Add a Sub Section to a Section
router.post("/addSubSection", auth, isInstructor, validate(addSubSectionSchema), createSubSection)
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
router.delete("/deleteCourse", auth, isInstructor, validate(courseIdSchema), deleteCourse)
// ********************************************************************************************************
//                                      Category routes (Only by Admin)
// ********************************************************************************************************
// Category can Only be Created by Admin
// TODO: Put IsAdmin Middleware here
router.post("/createCategory", auth, isAdmin, validate(createCategorySchema), createCategory)
router.post("/updateCategory", auth, isAdmin, validate(updateCategorySchema), updateCategory)
router.post("/deleteCategory", auth, isAdmin, validate(categoryIdSchema), deleteCategory)
router.get("/showAllCategories", cacheResponse(60), showAllCategories)
router.post("/getCategoryPageDetails", categoryPageDetails)

// ********************************************************************************************************
//                                      Rating and Review
// ********************************************************************************************************
router.post("/createRating", auth, isStudent, validate(createRatingSchema), createRating)
router.get("/getAverageRating", getAverageRating)
router.get("/getReviews", getAllRatingReview)

module.exports = router

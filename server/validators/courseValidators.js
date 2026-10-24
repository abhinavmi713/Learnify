const { z } = require("zod")
const { objectId, jsonStringArray, nonNegativeNumberLike } = require("./common")

const status = z.enum(["Draft", "Pending", "Published"])

// Multipart route (thumbnail upload) — see note in common.js: strings are
// validated, not transformed. "Published" is accepted by the schema on purpose
// so editCourse can answer it with its explicit 403 ("only an admin can
// publish") instead of a generic 400.
const createCourseSchema = z.object({
  courseName: z.string().trim().min(1, "Course name is required").max(120),
  courseDescription: z.string().trim().min(1, "Description is required").max(2000),
  whatYouWillLearn: z.string().trim().min(1, "Benefits are required").max(2000),
  price: nonNegativeNumberLike,
  tag: jsonStringArray("tag"),
  category: objectId,
  instructions: jsonStringArray("instructions"),
  status: status.optional(),
})

const editCourseSchema = z.object({
  courseId: objectId,
  courseName: z.string().trim().min(1).max(120).optional(),
  courseDescription: z.string().trim().min(1).max(2000).optional(),
  whatYouWillLearn: z.string().trim().min(1).max(2000).optional(),
  price: nonNegativeNumberLike.optional(),
  category: objectId.optional(),
  status: status.optional(),
  tag: jsonStringArray("tag").optional(),
  instructions: jsonStringArray("instructions").optional(),
})

const addSectionSchema = z.object({
  sectionName: z.string().trim().min(1, "Section name is required").max(120),
  courseId: objectId,
})
const updateSectionSchema = z.object({
  sectionName: z.string().trim().min(1, "Section name is required").max(120),
  sectionId: objectId,
  courseId: objectId,
})
const deleteSectionSchema = z.object({ sectionId: objectId, courseId: objectId })

// Multipart (video upload) — strings only.
const addSubSectionSchema = z.object({
  sectionId: objectId,
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(1000).optional(),
  videoUrl: z.string().trim().url().optional(),
  duration: nonNegativeNumberLike.optional(),
})
const updateSubSectionSchema = z.object({
  sectionId: objectId,
  subSectionId: objectId,
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  videoUrl: z.string().trim().url().optional(),
  duration: nonNegativeNumberLike.optional(),
})
const deleteSubSectionSchema = z.object({ sectionId: objectId, subSectionId: objectId })

const createRatingSchema = z.object({
  courseId: objectId,
  rating: z.coerce.number().min(1).max(5),
  review: z.string().trim().min(1, "Review text is required").max(1000),
})

const lectureProgressSchema = z.object({ courseId: objectId, subsectionId: objectId })
const watchPositionSchema = z.object({
  courseId: objectId,
  subsectionId: objectId,
  position: z.coerce.number().min(0),
})

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(80),
  description: z.string().trim().max(300).optional(),
})
const updateCategorySchema = z.object({
  categoryId: objectId,
  name: z.string().trim().min(1, "Category name is required").max(80),
  description: z.string().trim().max(300).optional(),
})
const categoryIdSchema = z.object({ categoryId: objectId })

module.exports = {
  createCourseSchema,
  editCourseSchema,
  addSectionSchema,
  updateSectionSchema,
  deleteSectionSchema,
  addSubSectionSchema,
  updateSubSectionSchema,
  deleteSubSectionSchema,
  createRatingSchema,
  lectureProgressSchema,
  watchPositionSchema,
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
}

const { z } = require("zod")
const { objectId } = require("./common")

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  dateOfBirth: z.string().trim().max(30).optional(),
  about: z.string().trim().max(500).optional(),
  contactNumber: z.union([z.string().trim().max(20), z.number()]).optional(),
  gender: z.string().trim().max(30).optional(),
})

const courseIdSchema = z.object({ courseId: objectId })

const createDiscussionSchema = z.object({
  courseId: objectId,
  subsectionId: objectId,
  sectionId: objectId.optional().or(z.literal("")),
  text: z.string().trim().min(1, "Write something first").max(2000),
  parentId: objectId.nullish(),
})
const deleteDiscussionSchema = z.object({ discussionId: objectId })

const createNoteSchema = z.object({
  courseId: objectId,
  subsectionId: objectId,
  timestamp: z.number().min(0),
  text: z.string().trim().min(1, "Write something first").max(2000),
})
const deleteNoteSchema = z.object({ noteId: objectId })

const quizIdSchema = z.object({ quizId: objectId })
const liveClassIdSchema = z.object({ liveClassId: objectId })
const notificationIdSchema = z.object({ notificationId: objectId })

const approveCourseSchema = z.object({ courseId: objectId })
const rejectCourseSchema = z.object({
  courseId: objectId,
  reason: z.string().trim().max(500).optional(),
})
const setUserActiveSchema = z.object({ userId: objectId, active: z.boolean() })

const setCouponActiveSchema = z.object({ couponId: objectId, active: z.boolean() })
const validateCouponSchema = z.object({
  code: z.string().trim().min(1, "Enter a coupon code").max(40),
  courses: z.array(objectId).min(1).max(10),
})

const updateLearningPathSchema = z.object({
  pathId: objectId,
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  courses: z.array(objectId).min(1).optional(),
})
const deleteLearningPathSchema = z.object({ pathId: objectId })

// Public form -> also rate limited. Previously unvalidated.
const contactFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  firstname: z.string().trim().min(1).max(60),
  lastname: z.string().trim().max(60).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(2000),
  phoneNo: z.union([z.string().trim().max(20), z.number()]).optional(),
  countrycode: z.string().trim().max(10).optional(),
})

module.exports = {
  updateProfileSchema,
  courseIdSchema,
  createDiscussionSchema,
  deleteDiscussionSchema,
  createNoteSchema,
  deleteNoteSchema,
  quizIdSchema,
  liveClassIdSchema,
  notificationIdSchema,
  approveCourseSchema,
  rejectCourseSchema,
  setUserActiveSchema,
  setCouponActiveSchema,
  validateCouponSchema,
  updateLearningPathSchema,
  deleteLearningPathSchema,
  contactFormSchema,
}

// ---- Schemas added for routes that read a body but had none.
const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).optional())

const searchCoursesSchema = z
  .object({
    search: z.string().max(200).optional(),
    category: z.union([objectId, z.literal("")]).optional(),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    minRating: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).max(5).optional()),
    sortBy: z.enum(["", "relevance", "popular", "newest", "priceLowHigh", "priceHighLow", "ratingHighLow"]).optional(),
    page: z.union([z.string(), z.number()]).optional(),
    limit: z.union([z.string(), z.number()]).optional(),
  })
  .strict()

const capturePaymentSchema = z.object({
  courses: z.array(objectId).min(1, "Please Provide Course ID").max(10, "You can check out at most 10 courses at a time"),
  couponCode: z.string().trim().max(50).optional(),
})

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
  courses: z.array(objectId).max(10).optional(),
})

const chatSchema = z.object({
  message: z.string().trim().min(1, "Invalid message input").max(2000, "Invalid message input"),
  courseId: z.union([objectId, z.literal(""), z.null()]).optional(),
})

const generateDescriptionSchema = z.object({
  courseTitle: z.string().trim().min(1, "courseTitle is required").max(200),
  topics: z.union([z.string().max(1000), z.array(z.string().max(200)).max(30)]).optional(),
})

const idParamSchema = z.object({ id: objectId })
const deliveryIdParamSchema = z.object({ deliveryId: objectId })

module.exports = {
  ...module.exports,
  searchCoursesSchema,
  capturePaymentSchema,
  verifyPaymentSchema,
  chatSchema,
  generateDescriptionSchema,
  idParamSchema,
  deliveryIdParamSchema,
}

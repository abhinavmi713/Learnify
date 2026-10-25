const mongoose = require("mongoose")

// Define the Courses schema
const coursesSchema = new mongoose.Schema({
  courseName: { type: String },
  courseDescription: { type: String },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "user",
    index: true,
  },
  whatYouWillLearn: {
    type: String,
  },
  courseContent: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
    },
  ],
  ratingAndReviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RatingAndReview",
    },
  ],
  price: {
    type: Number,
  },
  thumbnail: {
    type: String,
  },
  tag: {
    type: [String],
    required: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    // required: true,
    ref: "Category",
  },
  studentsEnroled: [
    {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "user",
    },
  ],
  instructions: {
    type: [String],
  },
  status: {
    type: String,
    enum: ["Draft", "Pending", "Published"],
    index: true,
  },
  // Set by an admin when rejecting a course submitted for review (status reverts to Draft).
  rejectionReason: {
    type: String,
  },
  // Soft-delete marker: an instructor "deleting" a course archives it instead
  // of destroying it — already-enrolled students keep their access and
  // content, it just disappears from public discovery and the instructor's
  // active course list. `null` means not deleted.
  deletedAt: {
    type: Date,
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
})

// Powers whole-word relevance-ranked search in searchCourses — far cheaper
// than a regex scan once the catalog is large, at the cost of not doing
// partial-word (substring) matches, which is why searchCourses still falls
// back to regex for short/single-word queries.
coursesSchema.index({ courseName: "text", courseDescription: "text", tag: "text" })
// Equality, Sort, Range: serves the catalog (Published, not deleted, newest
// first) and the moderation queue (Pending, newest first) without an in-memory
// sort. Measured with `npm run perf:explain` (docs/PERFORMANCE.md).
coursesSchema.index({ status: 1, createdAt: -1, deletedAt: 1 })
// An instructor's own courses (dashboard, live classes).
coursesSchema.index({ instructor: 1, deletedAt: 1 })

// Export the Courses model
module.exports = mongoose.model("Course", coursesSchema)

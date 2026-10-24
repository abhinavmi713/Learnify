const { z } = require("zod")

const createLearningPathSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional().or(z.literal("")),
  courses: z.array(z.string().min(1)).min(1, "At least one course is required"),
})

module.exports = { createLearningPathSchema }

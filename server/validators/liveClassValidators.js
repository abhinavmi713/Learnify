const { z } = require("zod")

const createLiveClassSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional().or(z.literal("")),
  meetingLink: z.string().trim().url("Enter a valid meeting URL"),
  scheduledAt: z.coerce.date(),
})

module.exports = { createLiveClassSchema }

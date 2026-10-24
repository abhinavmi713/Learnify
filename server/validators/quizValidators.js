const { z } = require("zod")

const questionSchema = z
  .object({
    questionText: z.string().trim().min(1, "Question text is required"),
    options: z.array(z.string().trim().min(1)).min(2, "At least 2 options required").max(6),
    correctOptionIndex: z.coerce.number().int().min(0),
  })
  .refine((q) => q.correctOptionIndex < q.options.length, {
    message: "correctOptionIndex must point to a valid option",
    path: ["correctOptionIndex"],
  })

const createQuizSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  title: z.string().trim().min(1, "Quiz title is required"),
  passingScore: z.coerce.number().min(1).max(100).optional(),
  questions: z.array(questionSchema).min(1, "A quiz needs at least one question"),
})

const generateQuizDraftSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  topic: z.string().trim().min(1, "Describe the topic to generate questions for"),
  numQuestions: z.coerce.number().int().min(1).max(10).optional(),
})

const submitQuizSchema = z.object({
  quizId: z.string().min(1, "quizId is required"),
  answers: z.array(
    z.object({
      question: z.string().min(1),
      selectedOptionIndex: z.coerce.number().int().min(0),
    })
  ),
})

module.exports = { createQuizSchema, generateQuizDraftSchema, submitQuizSchema }

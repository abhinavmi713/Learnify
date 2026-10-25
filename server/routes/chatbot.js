const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
require("dotenv").config();
const { chatbotLimiter } = require("../middleware/rateLimiter");
const { auth } = require("../middleware/auth");
const { tokenBucketLimiter } = require("../utils/tokenBucket");
const { callGemini } = require("../utils/gemini");
const Course = require("../models/Course");
const User = require("../models/User");
const aiService = require("../utils/aiService");
const { isCourseParticipant } = require("../utils/access");

// Builds a short grounding blurb from the course the student is currently
// viewing (if any), so answers can reference its actual content instead of
// being purely generic.
async function buildCourseContext(courseId) {
  if (!courseId || !mongoose.isValidObjectId(courseId)) return ""

  const course = await Course.findById(courseId)
    .select("courseName courseDescription whatYouWillLearn")
    .populate({ path: "courseContent", populate: { path: "subSection", select: "title" } })
  if (!course) return ""

  const lectureTitles = course.courseContent
    .flatMap((section) => section.subSection.map((sub) => sub.title))
    .slice(0, 30)
    .join(", ")

  return `\n\nThe student is currently viewing the course "${course.courseName}". Course description: ${course.courseDescription}. What they'll learn: ${course.whatYouWillLearn}.${
    lectureTitles ? ` Lecture topics covered in this course: ${lectureTitles}.` : ""
  } Ground your answer in this course's content when the question is relevant to it, but you can still answer general questions.`
}

// Each call spends paid model quota, so it requires a logged-in user (the UI
// already only shows the widget to them — this makes the API enforce it too).
// Per-user budget on top of the per-IP limit: bursts are fine, a sustained
// stream of questions is not (each one spends paid model quota).
const chatBucket = tokenBucketLimiter({
  name: "chat",
  capacity: 10,
  refillPerSec: 0.2,
  keyFn: (req) => req.user?.id,
});

// Course questions go to the AI service, which answers from the course's own
// lectures (retrieval-augmented) and cites them. Only someone who can see the
// course may ask about it. If the AI service is unavailable the student still
// gets an answer: the older prompt-only path, marked as not grounded.
async function courseForAsker(courseId, userId) {
  if (!courseId || !mongoose.isValidObjectId(courseId)) return null
  const [course, user] = await Promise.all([
    Course.findById(courseId).select("courseName instructor studentsEnroled"),
    User.findById(userId).select("accountType"),
  ])
  return isCourseParticipant(course, { id: userId, accountType: user?.accountType }) ? course : null
}

router.post("/chat", chatbotLimiter, auth, chatBucket, async (req, res) => {
  const { message, courseId } = req.body;

  if (!message || typeof message !== "string" || message.length > 2000) {
    return res.status(400).json({ success: false, error: "Invalid message input" });
  }

  try {
    const course = await courseForAsker(courseId, req.user.id)

    if (course && aiService.isConfigured()) {
      try {
        const result = await aiService.ask({ courseId: String(course._id), courseName: course.courseName, question: message })
        return res.json({
          success: true,
          reply: result.answer,
          grounded: result.grounded,
          citations: result.citations,
          courseId: String(course._id),
        })
      } catch (error) {
        console.warn("AI service unavailable, falling back:", error.message)
      }
    }

    const courseContext = course ? await buildCourseContext(courseId) : ""
    const prompt = `You are a helpful educational assistant for a learning platform called Learnify. Answer the student's question clearly and concisely in a friendly tone. Do not greet them or introduce yourself; answer directly.${courseContext}

Question: ${message}`

    const reply = await callGemini(prompt)
    res.json({ success: true, reply, grounded: false, citations: [] });
  } catch (error) {
    console.error("Chatbot error:", error.message);

    if (error.message === "GEMINI_API_KEY not configured") {
      return res.status(500).json({ success: false, error: "API key not configured" });
    }

    return res.status(500).json({
      success: false,
      error: "Gemini API Error",
      detail: error.detail || error.message,
    });
  }
});

module.exports = router;

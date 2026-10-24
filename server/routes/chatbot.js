const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
require("dotenv").config();
const { chatbotLimiter } = require("../middleware/rateLimiter");
const { auth } = require("../middleware/auth");
const { tokenBucketLimiter } = require("../utils/tokenBucket");
const { callGemini } = require("../utils/gemini");
const Course = require("../models/Course");

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

router.post("/chat", chatbotLimiter, auth, chatBucket, async (req, res) => {
  const { message, courseId } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ success: false, error: "Invalid message input" });
  }

  try {
    const courseContext = await buildCourseContext(courseId)
    const prompt = `You are a helpful educational assistant for a learning platform called Learnify. Answer the following question in a friendly and informative way.${courseContext}\n\nQuestion: ${message}`

    const reply = await callGemini(prompt)
    res.json({ success: true, reply });
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

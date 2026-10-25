const mongoose = require("mongoose")
const Course = require("../models/Course")
const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")
const logger = require("./logger")

// Works out which course a content-changing request touched.
async function resolveCourseId(req) {
  const { courseId, sectionId } = req.body || {}
  if (courseId && mongoose.isValidObjectId(courseId)) return String(courseId)
  if (sectionId && mongoose.isValidObjectId(sectionId)) {
    const course = await Course.findOne({ courseContent: sectionId }).select("_id")
    return course ? String(course._id) : null
  }
  return null
}

// Route middleware: once the request has SUCCEEDED, record a
// "course.content_changed" event. Downstream services (the AI service's search
// index) re-read the course and bring their own copy up to date; they decide what
// the change means (re-index a published course, drop an archived one).
//
// Recorded after the response, outside the business transaction, because it only
// triggers a refresh: if it is ever missed, `npm run reindex` in the AI service
// rebuilds everything.
function emitContentChanged(type = EVENTS.COURSE_CONTENT_CHANGED) {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return
      resolveCourseId(req)
        .then((courseId) => courseId && enqueueEvent(type, { courseId }))
        .catch((error) => logger.warn({ err: error.message }, "could not record course.content_changed"))
    })
    next()
  }
}

module.exports = { emitContentChanged, resolveCourseId }

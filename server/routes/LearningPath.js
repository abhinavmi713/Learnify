const express = require("express")
const router = express.Router()

const {
  createLearningPath,
  updateLearningPath,
  deleteLearningPath,
  getAllLearningPaths,
  getLearningPathDetails,
} = require("../controllers/LearningPath")
const { auth, isAdmin } = require("../middleware/auth")
const { updateLearningPathSchema, deleteLearningPathSchema } = require("../validators/miscValidators")
const { validate } = require("../middleware/validate")
const { createLearningPathSchema } = require("../validators/learningPathValidators")

router.get("/all", getAllLearningPaths)
router.get("/:pathId", getLearningPathDetails)
router.post("/create", auth, isAdmin, validate(createLearningPathSchema), createLearningPath)
router.post("/update", auth, isAdmin, validate(updateLearningPathSchema), updateLearningPath)
router.post("/delete", auth, isAdmin, validate(deleteLearningPathSchema), deleteLearningPath)
module.exports = router

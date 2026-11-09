const express = require("express")
const router = express.Router()

const { createNote, getNotesForSubsection, deleteNote } = require("../controllers/Note")
const { auth, requirePermission } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { createNoteSchema, deleteNoteSchema } = require("../validators/miscValidators")

router.post("/create", auth, requirePermission("course:learn"), validate(createNoteSchema), createNote)
router.get("/", auth, requirePermission("course:learn"), getNotesForSubsection)
router.post("/delete", auth, requirePermission("course:learn"), validate(deleteNoteSchema), deleteNote)
module.exports = router

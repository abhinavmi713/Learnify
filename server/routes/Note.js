const express = require("express")
const router = express.Router()

const { createNote, getNotesForSubsection, deleteNote } = require("../controllers/Note")
const { auth, isStudent } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { createNoteSchema, deleteNoteSchema } = require("../validators/miscValidators")

router.post("/create", auth, isStudent, validate(createNoteSchema), createNote)
router.get("/", auth, isStudent, getNotesForSubsection)
router.post("/delete", auth, isStudent, validate(deleteNoteSchema), deleteNote)
module.exports = router

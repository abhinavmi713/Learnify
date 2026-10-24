import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { createNote, deleteNote, getNotes } from "../../../services/operations/notesAPI"

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export default function VideoNotes({ courseId, subsectionId, getCurrentTime, onSeek }) {
  const { token } = useSelector((state) => state.auth)
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafting, setDrafting] = useState(false)
  const [draftText, setDraftText] = useState("")
  const [draftTimestamp, setDraftTimestamp] = useState(0)

  useEffect(() => {
    if (!subsectionId) return
    setLoading(true)
    getNotes(subsectionId, token).then((data) => {
      setNotes(data)
      setLoading(false)
    })
    setDrafting(false)
  }, [subsectionId, token])

  const startDraft = () => {
    setDraftTimestamp(Math.floor(getCurrentTime?.() || 0))
    setDraftText("")
    setDrafting(true)
  }

  const submitDraft = async () => {
    if (!draftText.trim()) return
    const note = await createNote(
      { courseId, subsectionId, timestamp: draftTimestamp, text: draftText.trim() },
      token
    )
    if (note) {
      setNotes((prev) => [...prev, note].sort((a, b) => a.timestamp - b.timestamp))
      setDrafting(false)
    }
  }

  const handleDelete = async (noteId) => {
    const ok = await deleteNote(noteId, token)
    if (ok) setNotes((prev) => prev.filter((n) => n._id !== noteId))
  }

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-richblack-5">My Notes</h3>
        <button
          onClick={startDraft}
          className="flex items-center gap-1 rounded-lg border border-richblack-600 px-3 py-1.5 text-sm text-richblack-100 transition-colors hover:border-richblack-400"
        >
          <Plus size={14} /> Add note
        </button>
      </div>

      {drafting && (
        <div className="mb-4 rounded-lg border border-richblue-300 bg-richblack-900 p-3">
          <p className="mb-2 text-xs font-medium text-richblue-200">
            At {formatTime(draftTimestamp)}
          </p>
          <textarea
            autoFocus
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Write your note..."
            rows={2}
            className="w-full rounded-lg border border-richblack-600 bg-richblack-800 p-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setDrafting(false)}
              className="rounded-lg px-3 py-1 text-sm text-richblack-300 hover:text-richblack-100"
            >
              Cancel
            </button>
            <button
              onClick={submitDraft}
              className="rounded-lg bg-yellow-50 px-3 py-1 text-sm font-semibold text-richblack-900 hover:bg-yellow-100"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-richblack-400">Loading notes...</p>
      ) : notes.length === 0 && !drafting ? (
        <p className="text-sm text-richblack-400">
          No notes yet — add one at your current timestamp.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <div
              key={note._id}
              className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-richblack-700"
            >
              <button
                onClick={() => onSeek?.(note.timestamp)}
                className="shrink-0 rounded-md bg-richblue-700 px-2 py-1 text-xs font-semibold text-richblue-100"
              >
                {formatTime(note.timestamp)}
              </button>
              <p className="flex-1 text-sm text-richblack-100">{note.text}</p>
              <button
                onClick={() => handleDelete(note._id)}
                aria-label="Delete note"
                className="shrink-0 text-richblack-300 hover:text-pink-200"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

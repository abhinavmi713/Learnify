import { MessageSquare, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { deleteDiscussion, getDiscussions, postDiscussion } from "../../../services/operations/discussionAPI"

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function Author({ user }) {
  const isInstructor = user?.accountType === "Instructor"
  return (
    <span className={`font-semibold ${isInstructor ? "text-yellow-50" : "text-richblack-5"}`}>
      {user?.firstName} {user?.lastName}
      {isInstructor && <span className="ml-1 text-xs font-normal text-yellow-50">(Instructor)</span>}
    </span>
  )
}

export default function LectureDiscussion({ courseId, sectionId, subsectionId }) {
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [newQuestion, setNewQuestion] = useState("")
  const [posting, setPosting] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState({})
  const [replyingTo, setReplyingTo] = useState(null)

  const load = async () => {
    if (!subsectionId) return
    setLoading(true)
    const data = await getDiscussions(subsectionId, token)
    setQuestions(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    setReplyingTo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsectionId])

  const handleAskQuestion = async () => {
    if (!newQuestion.trim()) return
    setPosting(true)
    const created = await postDiscussion(
      { courseId, subsectionId, sectionId, text: newQuestion.trim() },
      token
    )
    if (created) {
      setQuestions((prev) => [...prev, { ...created, replies: [] }])
      setNewQuestion("")
    }
    setPosting(false)
  }

  const handleReply = async (questionId) => {
    const text = replyDrafts[questionId]?.trim()
    if (!text) return
    const created = await postDiscussion(
      { courseId, subsectionId, sectionId, text, parentId: questionId },
      token
    )
    if (created) {
      setQuestions((prev) =>
        prev.map((q) => (q._id === questionId ? { ...q, replies: [...q.replies, created] } : q))
      )
      setReplyDrafts((prev) => ({ ...prev, [questionId]: "" }))
      setReplyingTo(null)
    }
  }

  const handleDelete = async (id, isQuestion) => {
    const ok = await deleteDiscussion(id, token)
    if (!ok) return
    if (isQuestion) {
      setQuestions((prev) => prev.filter((q) => q._id !== id))
    } else {
      setQuestions((prev) =>
        prev.map((q) => ({ ...q, replies: q.replies.filter((r) => r._id !== id) }))
      )
    }
  }

  const canDelete = (item) => item.user?._id === user?._id || user?.accountType === "Instructor"

  return (
    <div className="surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-richblack-5">
          <MessageSquare size={18} /> Discussion
        </h3>
      </div>

      <div className="mb-5 flex flex-col gap-2">
        <textarea
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Ask a question about this lecture..."
          rows={2}
          className="w-full rounded-lg border border-richblack-600 bg-richblack-900 p-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
        />
        <button
          onClick={handleAskQuestion}
          disabled={posting || !newQuestion.trim()}
          className="w-fit self-end rounded-lg bg-yellow-50 px-3 py-1.5 text-sm font-semibold text-richblack-900 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? "Posting..." : "Post Question"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-richblack-400">Loading discussion...</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-richblack-400">No questions yet — be the first to ask.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q) => (
            <div key={q._id} className="rounded-lg border border-richblack-700 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-richblack-100">
                  <Author user={q.user} /> · <span className="text-xs text-richblack-300">{timeAgo(q.createdAt)}</span>
                  <br />
                  {q.text}
                </p>
                {canDelete(q) && (
                  <button
                    onClick={() => handleDelete(q._id, true)}
                    className="shrink-0 text-richblack-300 hover:text-pink-200"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {q.replies?.length > 0 && (
                <div className="ml-4 mt-3 flex flex-col gap-2 border-l-2 border-richblack-700 pl-3">
                  {q.replies.map((r) => (
                    <div key={r._id} className="flex items-start justify-between gap-2">
                      <p className="text-sm text-richblack-200">
                        <Author user={r.user} /> · <span className="text-xs text-richblack-300">{timeAgo(r.createdAt)}</span>
                        <br />
                        {r.text}
                      </p>
                      {canDelete(r) && (
                        <button
                          onClick={() => handleDelete(r._id, false)}
                          className="shrink-0 text-richblack-300 hover:text-pink-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {replyingTo === q._id ? (
                <div className="ml-4 mt-3 flex flex-col gap-2">
                  <input
                    autoFocus
                    value={replyDrafts[q._id] || ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [q._id]: e.target.value }))}
                    placeholder="Write a reply..."
                    className="form-style !py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="text-xs text-richblack-400 hover:text-richblack-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReply(q._id)}
                      className="text-xs font-semibold text-richblue-200 hover:underline"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setReplyingTo(q._id)}
                  className="ml-4 mt-2 text-xs text-richblue-200 hover:underline"
                >
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Plus, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"

import {
  createQuiz,
  deleteQuiz,
  generateQuizDraft,
  getInstructorQuizzes,
} from "../../../services/operations/quizAPI"
import IconBtn from "../../Common/IconBtn"

const emptyQuestion = () => ({ questionText: "", options: ["", ""], correctOptionIndex: 0 })

export default function ManageQuizzes() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { token } = useSelector((state) => state.auth)

  const [quizzes, setQuizzes] = useState(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [passingScore, setPassingScore] = useState(70)
  const [questions, setQuestions] = useState([emptyQuestion()])
  const [submitting, setSubmitting] = useState(false)
  const [aiTopic, setAiTopic] = useState("")
  const [aiCount, setAiCount] = useState(5)
  const [generating, setGenerating] = useState(false)

  const loadQuizzes = async () => {
    const data = await getInstructorQuizzes(courseId, token)
    setQuizzes(data)
  }

  useEffect(() => {
    loadQuizzes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  const updateQuestion = (index, patch) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  const updateOption = (qIndex, optIndex, value) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q
        const options = [...q.options]
        options[optIndex] = value
        return { ...q, options }
      })
    )
  }

  const addOption = (qIndex) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex && q.options.length < 6 ? { ...q, options: [...q.options, ""] } : q))
    )
  }

  const removeOption = (qIndex, optIndex) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.options.length <= 2) return q
        const options = q.options.filter((_, oi) => oi !== optIndex)
        const correctOptionIndex = q.correctOptionIndex >= options.length ? 0 : q.correctOptionIndex
        return { ...q, options, correctOptionIndex }
      })
    )
  }

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()])
  const removeQuestion = (index) =>
    setQuestions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  const resetForm = () => {
    setTitle("")
    setPassingScore(70)
    setQuestions([emptyQuestion()])
    setAiTopic("")
    setAiCount(5)
    setCreating(false)
  }

  const handleGenerateAI = async () => {
    if (!aiTopic.trim()) return
    setGenerating(true)
    const draft = await generateQuizDraft(
      { courseId, topic: aiTopic.trim(), numQuestions: Number(aiCount) },
      token
    )
    if (draft) {
      setQuestions(draft)
    }
    setGenerating(false)
  }

  const handleSubmit = async () => {
    if (!title.trim()) return
    const cleaned = questions.map((q) => ({
      ...q,
      options: q.options.map((o) => o.trim()),
    }))
    const invalid = cleaned.some((q) => !q.questionText.trim() || q.options.some((o) => !o))
    if (invalid) return

    setSubmitting(true)
    const quiz = await createQuiz(
      { courseId, title: title.trim(), passingScore: Number(passingScore), questions: cleaned },
      token
    )
    setSubmitting(false)
    if (quiz) {
      resetForm()
      loadQuizzes()
    }
  }

  const handleDelete = async (quizId) => {
    const ok = await deleteQuiz(quizId, token)
    if (ok) loadQuizzes()
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button onClick={() => navigate(-1)} className="mb-2 text-sm text-richblack-300 hover:text-richblack-100">
            ← Back
          </button>
          <h1 className="font-display text-3xl font-bold text-richblack-5">Manage Quizzes</h1>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="yellowButton flex items-center gap-2">
            <Plus size={16} /> New Quiz
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-8 surface p-6">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz title"
              className="form-style sm:col-span-2"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(e.target.value)}
              placeholder="Passing score %"
              className="form-style"
            />
          </div>

          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-dashed border-richblue-200 bg-richblack-900 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-richblack-300">
                Describe the lecture/topic — AI drafts the questions for you to review
              </label>
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="e.g. CSS Flexbox: main-axis, cross-axis, justify-content, align-items"
                className="form-style w-full"
              />
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={aiCount}
              onChange={(e) => setAiCount(e.target.value)}
              className="form-style w-full sm:w-24"
              title="Number of questions"
            />
            <button
              type="button"
              disabled={generating || !aiTopic.trim()}
              onClick={handleGenerateAI}
              className="flex items-center justify-center gap-2 rounded-lg bg-richblue-200 px-4 py-2 font-semibold text-richblack-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} /> {generating ? "Generating..." : "Generate with AI"}
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {questions.map((q, qIndex) => (
              <div key={qIndex} className="rounded-lg border border-richblack-600 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-richblack-200">Question {qIndex + 1}</p>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(qIndex)} className="text-richblack-300 hover:text-pink-200">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <input
                  value={q.questionText}
                  onChange={(e) => updateQuestion(qIndex, { questionText: e.target.value })}
                  placeholder="Question text"
                  className="form-style mb-3 w-full"
                />
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, optIndex) => (
                    <div key={optIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={q.correctOptionIndex === optIndex}
                        onChange={() => updateQuestion(qIndex, { correctOptionIndex: optIndex })}
                        title="Mark as correct answer"
                      />
                      <input
                        value={opt}
                        onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                        placeholder={`Option ${optIndex + 1}`}
                        className="form-style flex-1 !py-2"
                      />
                      {q.options.length > 2 && (
                        <button
                          onClick={() => removeOption(qIndex, optIndex)}
                          className="text-richblack-300 hover:text-pink-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 6 && (
                    <button
                      onClick={() => addOption(qIndex)}
                      className="mt-1 w-fit text-xs text-richblue-200 hover:underline"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button onClick={addQuestion} className="mt-4 flex items-center gap-1 text-sm text-richblue-200 hover:underline">
            <Plus size={14} /> Add question
          </button>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={resetForm} className="rounded-lg px-4 py-2 text-richblack-300 hover:text-richblack-100">
              Cancel
            </button>
            <IconBtn
              text={submitting ? "Creating..." : "Create Quiz"}
              onclick={handleSubmit}
              disabled={submitting}
            />
          </div>
        </div>
      )}

      {quizzes === null ? (
        <div className="spinner"></div>
      ) : quizzes.length === 0 ? (
        <p className="text-richblack-300">No quizzes yet for this course.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.map((quiz) => (
            <div
              key={quiz._id}
              className="flex items-center justify-between surface p-4"
            >
              <div>
                <p className="font-semibold text-richblack-5">{quiz.title}</p>
                <p className="text-sm text-richblack-400">
                  {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} · Pass at{" "}
                  {quiz.passingScore}%
                </p>
              </div>
              <button onClick={() => handleDelete(quiz._id)} className="text-richblack-400 hover:text-pink-200">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

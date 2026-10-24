import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"

import { getStudentQuizzes, submitQuiz } from "../../../services/operations/quizAPI"
import IconBtn from "../../Common/IconBtn"

export default function TakeQuiz() {
  const { courseId, quizId } = useParams()
  const navigate = useNavigate()
  const { token } = useSelector((state) => state.auth)

  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    getStudentQuizzes(courseId, token).then((quizzes) => {
      setQuiz(quizzes.find((q) => q._id === quizId) || null)
    })
  }, [courseId, quizId, token])

  const selectAnswer = (questionId, optionIndex) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    const payload = {
      quizId,
      answers: Object.entries(answers).map(([question, selectedOptionIndex]) => ({
        question,
        selectedOptionIndex,
      })),
    }
    const res = await submitQuiz(payload, token)
    setSubmitting(false)
    if (res) setResult(res)
  }

  if (!quiz) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="mb-4 text-2xl font-semibold text-richblack-5">
          {result.data.passed ? "🎉 You passed!" : "Not quite there yet"}
        </h1>
        <p className="mb-1 text-richblack-200">
          Score: <span className="font-semibold">{result.data.score}%</span> (needed{" "}
          {result.data.passingScore}%)
        </p>
        {result.certificateIssued && (
          <p className="mb-4 text-caribbeangreen-100">
            Your course certificate has been issued — check "My Certificates" in your dashboard.
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          {!result.data.passed && (
            <button
              onClick={() => {
                setResult(null)
                setAnswers({})
              }}
              className="yellowButton"
            >
              Try Again
            </button>
          )}
          <button onClick={() => navigate(`/view-course/${courseId}/quizzes`)} className="blackButton">
            Back to Quizzes
          </button>
        </div>
      </div>
    )
  }

  const allAnswered = quiz.questions.every((q) => answers[q._id] !== undefined)

  return (
    <div className="py-6">
      <h1 className="mb-6 text-3xl font-semibold text-richblack-5">{quiz.title}</h1>
      <div className="flex flex-col gap-6">
        {quiz.questions.map((q, i) => (
          <div key={q._id} className="surface p-5">
            <p className="mb-3 font-medium text-richblack-5">
              {i + 1}. {q.questionText}
            </p>
            <div className="flex flex-col gap-2">
              {q.options.map((opt, optIndex) => (
                <label
                  key={optIndex}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    answers[q._id] === optIndex
                      ? "border-yellow-50 bg-richblack-700"
                      : "border-richblack-600 hover:border-richblack-400"
                  }`}
                >
                  <input
                    type="radio"
                    name={q._id}
                    checked={answers[q._id] === optIndex}
                    onChange={() => selectAnswer(q._id, optIndex)}
                  />
                  <span className="text-richblack-100">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <IconBtn
          text={submitting ? "Submitting..." : "Submit Quiz"}
          onclick={handleSubmit}
          disabled={submitting || !allAnswered}
        />
      </div>
    </div>
  )
}

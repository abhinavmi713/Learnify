import { CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"

import { getStudentQuizzes } from "../../../services/operations/quizAPI"

export default function CourseQuizzes() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { token } = useSelector((state) => state.auth)
  const [quizzes, setQuizzes] = useState(null)

  useEffect(() => {
    getStudentQuizzes(courseId, token).then(setQuizzes)
  }, [courseId, token])

  if (quizzes === null) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="py-6">
      <h1 className="mb-6 text-3xl font-semibold text-richblack-5">Course Quizzes</h1>
      {quizzes.length === 0 ? (
        <p className="text-richblack-300">This course has no quizzes.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {quizzes.map((quiz) => (
            <div
              key={quiz._id}
              className="flex items-center justify-between surface p-5"
            >
              <div>
                <p className="text-lg font-semibold text-richblack-5">{quiz.title}</p>
                <p className="text-sm text-richblack-400">
                  {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} · Pass at{" "}
                  {quiz.passingScore}%
                </p>
                {quiz.bestScore !== null && (
                  <p
                    className={`mt-1 flex items-center gap-1 text-sm font-medium ${
                      quiz.passed ? "text-caribbeangreen-100" : "text-pink-200"
                    }`}
                  >
                    {quiz.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    Best score: {quiz.bestScore}% {quiz.passed ? "(Passed)" : "(Not passed)"}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate(`/view-course/${courseId}/quiz/${quiz._id}`)}
                className="yellowButton"
              >
                {quiz.passed ? "Retake" : "Take Quiz"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

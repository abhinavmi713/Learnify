import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react"
import useConfirm from "../../../../hooks/useConfirm"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import Pagination from "../../../Common/Pagination"
import { getAllCourses } from "../../../../services/operations/courseDetailsAPI"
import {
  createLearningPath,
  deleteLearningPath,
  getLearningPathsPage,
} from "../../../../services/operations/learningPathAPI"

export default function ManageLearningPaths() {
  const { token } = useSelector((state) => state.auth)
  const [paths, setPaths] = useState(null)
  const [allCourses, setAllCourses] = useState([])
  const [form, setForm] = useState({ title: "", description: "" })
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)

  const load = async () => {
    const { items, pagination } = await getLearningPathsPage(page)
    setPaths(items)
    setPagination(pagination)
  }

  useEffect(() => {
    // The 100 newest courses (the endpoint is paginated).
    getAllCourses({ limit: 100 }).then((c) => setAllCourses(c || []))
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const addCourse = (courseId) => {
    if (!courseId || selectedCourseIds.includes(courseId)) return
    setSelectedCourseIds((prev) => [...prev, courseId])
  }

  const removeCourse = (courseId) => {
    setSelectedCourseIds((prev) => prev.filter((id) => id !== courseId))
  }

  const moveCourse = (index, direction) => {
    setSelectedCourseIds((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || selectedCourseIds.length === 0) return
    setSubmitting(true)
    const ok = await createLearningPath(
      { title: form.title.trim(), description: form.description.trim(), courses: selectedCourseIds },
      token
    )
    if (ok) {
      setForm({ title: "", description: "" })
      setSelectedCourseIds([])
      load()
    }
    setSubmitting(false)
  }

  const [confirm, confirmModal] = useConfirm()

  const handleDelete = async (pathId) => {
    const sure = await confirm({ title: "Delete this learning path?", body: "This cannot be undone." })
    if (!sure) return
    const ok = await deleteLearningPath(pathId, token)
    if (ok) load()
  }

  const courseById = (id) => allCourses.find((c) => c._id === id)

  return (
    <div>
      {confirmModal}
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Manage Learning Paths</h1>

      <form
        onSubmit={handleCreate}
        className="mb-10 flex flex-col gap-4 surface p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Path title (e.g. Frontend Developer)"
            className="form-style"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="form-style"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-richblack-300">Add a course to the path</label>
          <select onChange={(e) => addCourse(e.target.value)} value="" className="form-style w-full sm:w-96">
            <option value="">Select a course to add</option>
            {allCourses
              .filter((c) => !selectedCourseIds.includes(c._id))
              .map((c) => (
                <option key={c._id} value={c._id}>
                  {c.courseName}
                </option>
              ))}
          </select>
        </div>

        {selectedCourseIds.length > 0 && (
          <div className="flex flex-col gap-2">
            {selectedCourseIds.map((id, index) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg border border-richblack-600 bg-richblack-900 px-3 py-2"
              >
                <span className="text-sm text-richblack-100">
                  {index + 1}. {courseById(id)?.courseName || id}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveCourse(index, -1)}
                    disabled={index === 0}
                    className="text-richblack-400 hover:text-richblack-100 disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCourse(index, 1)}
                    disabled={index === selectedCourseIds.length - 1}
                    className="text-richblack-400 hover:text-richblack-100 disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCourse(id)}
                    className="text-richblack-400 hover:text-pink-200"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !form.title.trim() || selectedCourseIds.length === 0}
          className="yellowButton w-fit"
        >
          {submitting ? "Creating..." : "Create Learning Path"}
        </button>
      </form>

      {paths === null ? (
        <div className="spinner"></div>
      ) : paths.length === 0 ? (
        <p className="text-richblack-300">No learning paths created yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {paths.map((path) => (
            <div
              key={path._id}
              className="flex items-center justify-between surface p-4"
            >
              <div>
                <p className="font-semibold text-richblack-5">{path.title}</p>
                <p className="text-sm text-richblack-400">
                  {path.courses.length} course{path.courses.length === 1 ? "" : "s"}
                  {path.description ? ` · ${path.description}` : ""}
                </p>
              </div>
              <button onClick={() => handleDelete(path._id)} aria-label="Delete learning path" className="text-richblack-400 hover:text-pink-200">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Pagination pagination={pagination} onChange={setPage} />
    </div>
  )
}

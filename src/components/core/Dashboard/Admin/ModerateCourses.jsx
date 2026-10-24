import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import {
  approveCourse,
  getArchivedCourses,
  getPendingCourses,
  rejectCourse,
  restoreCourse,
} from "../../../../services/operations/adminAPI"
import Pagination from "../../../Common/Pagination"

const TABS = [
  { key: "pending", label: "Pending review" },
  { key: "archived", label: "Archived" },
]

export default function ModerateCourses() {
  const { token } = useSelector((state) => state.auth)
  const [tab, setTab] = useState("pending")
  const [courses, setCourses] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [rejectingId, setRejectingId] = useState(null)
  const [reason, setReason] = useState("")
  const [busyId, setBusyId] = useState(null)

  const fetchCourses = async () => {
    setLoading(true)
    const load = tab === "pending" ? getPendingCourses : getArchivedCourses
    const { items, pagination } = await load(token, page)
    setCourses(items)
    setPagination(pagination)
    setLoading(false)
  }

  useEffect(() => {
    fetchCourses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page])

  const switchTab = (key) => {
    setTab(key)
    setPage(1)
    setRejectingId(null)
  }

  const handleApprove = async (courseId) => {
    setBusyId(courseId)
    const ok = await approveCourse(courseId, token)
    if (ok) fetchCourses()
    setBusyId(null)
  }

  const handleReject = async (courseId) => {
    setBusyId(courseId)
    const ok = await rejectCourse(courseId, reason.trim(), token)
    if (ok) {
      setRejectingId(null)
      setReason("")
      fetchCourses()
    }
    setBusyId(null)
  }

  const handleRestore = async (courseId) => {
    setBusyId(courseId)
    const ok = await restoreCourse(courseId, token)
    if (ok) fetchCourses()
    setBusyId(null)
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold text-richblack-5">Moderate Courses</h1>

      <div role="tablist" className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => switchTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "border-yellow-50 text-yellow-50"
                : "border-richblack-700 text-richblack-300 hover:border-richblack-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : courses.length === 0 ? (
        <p className="text-richblack-300">
          {tab === "pending" ? "No courses are awaiting review." : "No archived courses."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {courses.map((course) => (
            <div
              key={course._id}
              className="flex flex-col gap-4 surface p-4 sm:flex-row"
            >
              <img
                src={course.thumbnail}
                alt={course.courseName}
                className="h-[120px] w-full rounded-md object-cover sm:w-[180px]"
              />
              <div className="flex flex-1 flex-col justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-richblack-5">{course.courseName}</p>
                  <p className="text-sm text-richblack-300">
                    By {course.instructor?.firstName} {course.instructor?.lastName} ·{" "}
                    {course.category?.name || "Uncategorized"} · ₹{course.price}
                    {tab === "archived" && course.deletedAt
                      ? ` · deleted ${new Date(course.deletedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-richblack-400">
                    {course.courseDescription}
                  </p>
                </div>

                {tab === "archived" ? (
                  <div>
                    <button
                      disabled={busyId === course._id}
                      onClick={() => handleRestore(course._id)}
                      className="yellowButton"
                    >
                      Restore
                    </button>
                  </div>
                ) : rejectingId === course._id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection"
                      className="form-style flex-1"
                    />
                    <button
                      disabled={busyId === course._id}
                      onClick={() => handleReject(course._id)}
                      className="rounded-lg bg-pink-200 px-4 py-2 font-semibold text-richblack-900"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null)
                        setReason("")
                      }}
                      className="rounded-lg border border-richblack-600 px-4 py-2 text-richblack-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      disabled={busyId === course._id}
                      onClick={() => handleApprove(course._id)}
                      className="yellowButton"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === course._id}
                      onClick={() => setRejectingId(course._id)}
                      className="rounded-lg border border-pink-200 px-4 py-2 font-semibold text-pink-200"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination pagination={pagination} onChange={setPage} />
    </div>
  )
}

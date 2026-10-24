import { Trash2, Video } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { fetchInstructorCourses } from "../../../services/operations/courseDetailsAPI"
import {
  createLiveClass,
  deleteLiveClass,
  getInstructorLiveClasses,
} from "../../../services/operations/liveClassAPI"

export default function LiveClass() {
  const { token } = useSelector((state) => state.auth)
  const [courses, setCourses] = useState([])
  const [liveClasses, setLiveClasses] = useState(null)
  const [form, setForm] = useState({
    courseId: "",
    title: "",
    description: "",
    meetingLink: "",
    scheduledAt: "",
  })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLiveClasses(await getInstructorLiveClasses(token))
  }

  useEffect(() => {
    fetchInstructorCourses(token).then((c) => setCourses(c || []))
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSchedule = async (e) => {
    e.preventDefault()
    if (!form.courseId || !form.title.trim() || !form.meetingLink.trim() || !form.scheduledAt) {
      return
    }
    setSubmitting(true)
    const created = await createLiveClass(form, token)
    if (created) {
      setForm({ courseId: "", title: "", description: "", meetingLink: "", scheduledAt: "" })
      load()
    }
    setSubmitting(false)
  }

  const handleCancel = async (liveClassId) => {
    const ok = await deleteLiveClass(liveClassId, token)
    if (ok) load()
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Live Classes</h1>

      <form
        onSubmit={handleSchedule}
        className="mb-10 grid grid-cols-1 gap-4 surface p-6 sm:grid-cols-2"
      >
        <select
          value={form.courseId}
          onChange={(e) => setForm({ ...form, courseId: e.target.value })}
          className="form-style"
        >
          <option value="">Select a course</option>
          {courses.map((c) => (
            <option key={c._id} value={c._id}>
              {c.courseName}
            </option>
          ))}
        </select>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Class title"
          className="form-style"
        />
        <input
          value={form.meetingLink}
          onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
          placeholder="Meeting link (Google Meet/Zoom URL)"
          className="form-style"
        />
        <input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          className="form-style"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
          className="form-style sm:col-span-2"
        />
        <button type="submit" disabled={submitting} className="yellowButton w-fit sm:col-span-2">
          {submitting ? "Scheduling..." : "Schedule Class"}
        </button>
      </form>

      {liveClasses === null ? (
        <div className="spinner"></div>
      ) : liveClasses.length === 0 ? (
        <p className="text-richblack-300">No live classes scheduled yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {liveClasses.map((lc) => (
            <div
              key={lc._id}
              className="flex items-center justify-between surface p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 grid h-9 w-9 place-items-center rounded-full bg-yellow-50/10 text-yellow-50">
                  <Video size={18} />
                </div>
                <div>
                  <p className="font-semibold text-richblack-5">{lc.title}</p>
                  <p className="text-sm text-richblack-400">
                    {lc.course?.courseName} · {new Date(lc.scheduledAt).toLocaleString()}
                  </p>
                  {lc.description && <p className="mt-1 text-sm text-richblack-300">{lc.description}</p>}
                  <a
                    href={lc.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-richblue-200 hover:underline"
                  >
                    {lc.meetingLink}
                  </a>
                </div>
              </div>
              <button onClick={() => handleCancel(lc._id)} className="text-richblack-400 hover:text-pink-200">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

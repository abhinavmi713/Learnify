import { Video } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { getStudentLiveClasses } from "../../../services/operations/liveClassAPI"

export default function StudentLiveClasses() {
  const { token } = useSelector((state) => state.auth)
  const [liveClasses, setLiveClasses] = useState(null)

  useEffect(() => {
    getStudentLiveClasses(token).then(setLiveClasses)
  }, [token])

  if (liveClasses === null) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  const now = Date.now()
  const upcoming = liveClasses.filter((lc) => new Date(lc.scheduledAt).getTime() >= now)
  const past = liveClasses.filter((lc) => new Date(lc.scheduledAt).getTime() < now)

  const renderCard = (lc) => (
    <div
      key={lc._id}
      className="flex items-start gap-3 surface p-4"
    >
      <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yellow-50/10 text-yellow-50">
        <Video size={18} />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-richblack-5">{lc.title}</p>
        <p className="text-sm text-richblack-400">
          {lc.course?.courseName} · {new Date(lc.scheduledAt).toLocaleString()}
        </p>
        {lc.description && <p className="mt-1 text-sm text-richblack-300">{lc.description}</p>}
      </div>
      {new Date(lc.scheduledAt).getTime() >= now && (
        <a
          href={lc.meetingLink}
          target="_blank"
          rel="noreferrer"
          className="yellowButton self-center whitespace-nowrap"
        >
          Join
        </a>
      )}
    </div>
  )

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Live Classes</h1>

      <p className="mb-4 text-lg font-semibold text-richblack-5">Upcoming</p>
      {upcoming.length === 0 ? (
        <p className="mb-8 text-richblack-300">No upcoming live classes scheduled.</p>
      ) : (
        <div className="mb-8 flex flex-col gap-3">{upcoming.map(renderCard)}</div>
      )}

      {past.length > 0 && (
        <>
          <p className="mb-4 text-lg font-semibold text-richblack-5">Past</p>
          <div className="flex flex-col gap-3 opacity-60">{past.map(renderCard)}</div>
        </>
      )}
    </div>
  )
}

import { Award, Lock } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { getMyBadges } from "../../../services/operations/profileAPI"

export default function Achievements() {
  const { token } = useSelector((state) => state.auth)
  const [badges, setBadges] = useState(null)

  useEffect(() => {
    getMyBadges(token).then(setBadges)
  }, [token])

  if (badges === null) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  const achievedCount = badges.filter((b) => b.achieved).length

  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-bold text-richblack-5">Achievements</h1>
      <p className="mb-8 text-richblack-300">
        {achievedCount} of {badges.length} badges earned
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className={`flex items-center gap-3 rounded-xl border p-5 ${
              badge.achieved
                ? "border-yellow-50/40 bg-richblack-800"
                : "border-richblack-700 bg-richblack-800 opacity-50"
            }`}
          >
            <div
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
                badge.achieved ? "bg-yellow-50/10 text-yellow-50" : "bg-richblack-700 text-richblack-300"
              }`}
            >
              {badge.achieved ? <Award size={22} /> : <Lock size={20} />}
            </div>
            <div>
              <p className="font-semibold text-richblack-5">{badge.name}</p>
              <p className="text-sm text-richblack-400">{badge.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

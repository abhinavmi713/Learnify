import { Award, Download } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import EmptyState from "../../Common/EmptyState"

import { downloadCertificate, getMyCertificates } from "../../../services/operations/certificateAPI"

export default function Certificates() {
  const { token } = useSelector((state) => state.auth)
  const [certificates, setCertificates] = useState(null)

  useEffect(() => {
    getMyCertificates(token).then(setCertificates)
  }, [token])

  if (certificates === null) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">My Certificates</h1>
      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          text="Complete a course, and pass its quizzes if it has any, to earn your first certificate."
          actionLabel="Go to my courses"
          actionTo="/dashboard/enrolled-courses"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {certificates.map((cert) => (
            <div
              key={cert._id}
              className="flex items-center justify-between surface p-5"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-yellow-50/10 text-yellow-50">
                  <Award size={20} />
                </div>
                <div>
                  <p className="font-semibold text-richblack-5">{cert.course?.courseName}</p>
                  <p className="text-xs text-richblack-400">
                    Issued {new Date(cert.issuedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => downloadCertificate(cert.certificateId, token)}
                title="Download PDF"
                className="rounded-lg border border-richblack-600 p-2 text-richblack-100 hover:border-richblack-400"
              >
                <Download size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

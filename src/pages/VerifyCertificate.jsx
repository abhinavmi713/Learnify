import { CheckCircle2, ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

import { verifyCertificate } from "../services/operations/certificateAPI"

export default function VerifyCertificate() {
  const { certificateId } = useParams()
  const [result, setResult] = useState(null)

  useEffect(() => {
    verifyCertificate(certificateId).then(setResult)
  }, [certificateId])

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 text-center">
      {result === null ? (
        <div className="spinner"></div>
      ) : result.valid ? (
        <>
          <CheckCircle2 size={56} className="mb-4 text-caribbeangreen-100" />
          <h1 className="mb-2 text-2xl font-semibold text-richblack-5">Certificate Verified</h1>
          <div className="mt-4 w-full surface p-6 text-left">
            <p className="text-sm text-richblack-400">Student</p>
            <p className="mb-3 text-lg font-semibold text-richblack-5">{result.data.studentName}</p>
            <p className="text-sm text-richblack-400">Course</p>
            <p className="mb-3 text-lg font-semibold text-richblack-5">{result.data.courseName}</p>
            <p className="text-sm text-richblack-400">Issued On</p>
            <p className="text-lg font-semibold text-richblack-5">
              {new Date(result.data.issuedAt).toLocaleDateString()}
            </p>
          </div>
          <p className="mt-4 break-all text-xs text-richblack-300">ID: {result.data.certificateId}</p>
        </>
      ) : (
        <>
          <ShieldAlert size={56} className="mb-4 text-pink-200" />
          <h1 className="mb-2 text-2xl font-semibold text-richblack-5">Certificate Not Found</h1>
          <p className="text-richblack-300">
            This certificate ID doesn't match any issued certificate. Double-check the link.
          </p>
        </>
      )}
    </div>
  )
}

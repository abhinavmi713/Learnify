import { Pencil } from "lucide-react"
import { useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { formattedDate } from "../../../utils/dateFormatter"

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-richblack-300">{label}</p>
      {value ? (
        <p className="mt-1 break-words text-base font-medium text-richblack-5">{value}</p>
      ) : (
        <p className="mt-1 text-base italic text-richblack-400">Not added</p>
      )}
    </div>
  )
}

export default function MyProfile() {
  const { user } = useSelector((state) => state.profile)
  const navigate = useNavigate()
  const details = user?.additionalDetails
  // A missing date of birth must not render as the 1970 epoch.
  const dob = details?.dateOfBirth ? formattedDate(details.dateOfBirth) : null

  return (
    <>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">My Profile</h1>

      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-richblack-700 p-6 sm:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={user?.image}
              alt={`${user?.firstName} ${user?.lastName}`}
              className="aspect-square w-20 rounded-full object-cover ring-4 ring-richblack-700"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-bold text-richblack-5">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-sm text-richblack-300">{user?.email}</p>
              <span className="mt-2 inline-block rounded-full bg-yellow-50/15 px-3 py-0.5 text-xs font-semibold text-yellow-50">
                {user?.accountType}
              </span>
            </div>
          </div>
          <button onClick={() => navigate("/dashboard/settings")} className="yellowButton flex items-center gap-2">
            <Pencil size={16} /> Edit profile
          </button>
        </div>

        <div className="border-b border-richblack-700 p-6 sm:p-8">
          <h2 className="mb-3 font-display text-lg font-bold text-richblack-5">About</h2>
          {details?.about ? (
            <p className="max-w-3xl leading-relaxed text-richblack-100">{details.about}</p>
          ) : (
            <p className="text-richblack-400">
              Tell people a little about yourself.{" "}
              <button
                onClick={() => navigate("/dashboard/settings")}
                className="font-semibold text-yellow-50 hover:underline"
              >
                Add a short bio
              </button>
            </p>
          )}
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="mb-5 font-display text-lg font-bold text-richblack-5">Personal details</h2>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="First name" value={user?.firstName} />
            <Field label="Last name" value={user?.lastName} />
            <Field label="Email" value={user?.email} />
            <Field label="Phone number" value={details?.contactNumber} />
            <Field label="Gender" value={details?.gender} />
            <Field label="Date of birth" value={dob} />
          </div>
        </div>
      </div>
    </>
  )
}

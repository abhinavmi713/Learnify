import React from "react"
import { useNavigate } from "react-router-dom"

export default function LiveClass() {
  const navigate = useNavigate()

  // Replace with actual class link (Google Meet or Zoom)
  const meetingLink = "https://meet.google.com/xyz-abcw-def"

  const handleStartClass = () => {
    window.open(meetingLink, "_blank")
  }

  return (
    <>
      <h1 className="mb-14 text-3xl font-medium text-richblack-5">
        Live Class
      </h1>

      <div className="flex flex-col gap-y-10 rounded-md border-[1px] border-richblack-700 bg-richblack-800 p-8 px-12">
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-richblack-5">
              Upcoming Class
            </p>
            <p className="text-sm text-richblack-300 mt-2">
              Join your scheduled live class using the button below.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border-[1px] border-richblack-700 bg-richblack-900 p-6">
          <div className="flex flex-col">
            <p className="text-base text-richblack-300 mb-1">Class Title</p>
            <p className="text-xl font-semibold text-richblack-5">
              Full Stack Development - Live Session
            </p>
            <p className="mt-2 text-sm text-richblack-400">
              Instructor: John Doe
            </p>
            <p className="text-sm text-richblack-400">Time: 6:00 PM - 7:00 PM</p>
          </div>

          <button
            onClick={handleStartClass}
            className="px-6 py-3 bg-yellow-50 text-black font-semibold rounded-lg shadow-sm hover:bg-yellow-100 transition duration-300"
          >
            Start Class
          </button>
        </div>
      </div>
    </>
  )
}

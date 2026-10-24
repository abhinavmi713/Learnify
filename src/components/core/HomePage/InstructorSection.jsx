import { ArrowRight } from "lucide-react"
import { useSelector } from "react-redux"
import { Link } from "react-router-dom"

import Instructor from "../../../assets/Images/Instructor.png"

const InstructorSection = () => {
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const isInstructor = user?.accountType === "Instructor"
  // Students and admins already have an account; sending them back to sign-up is a dead end.
  if (token && !isInstructor) return null

  return (
  <div className="relative overflow-hidden rounded-[2rem] bg-yellow-50 text-richblack-900">
    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-richblue-300/40 blur-2xl" />
    <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">For instructors</p>
        <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
          Teach what you love. Reach learners everywhere.
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed opacity-85">
          Build a course with our editor, publish after a quick review, and earn from every
          enrollment. We handle video, payments and certificates.
        </p>
        <Link
          to={isInstructor ? "/dashboard/add-course" : "/signup"}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-richblack-900 px-7 py-3 font-semibold text-richblack-5 transition-transform hover:-translate-y-0.5"
        >
          {isInstructor ? "Create a new course" : "Start teaching today"} <ArrowRight size={18} />
        </Link>
      </div>
      <img
        src={Instructor}
        alt="An instructor teaching on Learnify"
        className="w-full rounded-2xl object-cover shadow-card"
      />
    </div>
  </div>
  )
}

export default InstructorSection

import { ArrowRight, Award, Search, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Link, useNavigate } from "react-router-dom"

import Banner from "../assets/Images/banner.mp4"
import Footer from "../components/Common/Footer"
import ReviewSlider from "../components/Common/ReviewSlider"
import CourseCard from "../components/core/Catalog/Course_Card"
import CTAButton from "../components/core/HomePage/Button"
import HighlightText from "../components/core/HomePage/HighlightText"
import HowItWorks from "../components/core/HomePage/HowItWorks"
import InstructorSection from "../components/core/HomePage/InstructorSection"
import WhyLearnify from "../components/core/HomePage/WhyLearnify"
import { apiConnector } from "../services/apiConnector"
import { categories, courseEndpoints } from "../services/apis"
import { getUserEnrolledCourses } from "../services/operations/profileAPI"
import { ACCOUNT_TYPE } from "../utils/constants"
import { landingPathFor } from "../utils/landing"

const toSlug = (name) => name.split(" ").join("-").toLowerCase()

function Home() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [courses, setCourses] = useState([])
  const [courseTotal, setCourseTotal] = useState(null)
  const [cats, setCats] = useState([])
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const [resume, setResume] = useState(null)

  // Students get a "continue where you left off" card for their first unfinished course.
  useEffect(() => {
    if (!token || user?.accountType !== ACCOUNT_TYPE.STUDENT) return
    getUserEnrolledCourses(token)
      .then((list) => {
        const open = (list || []).filter((c) => c.status !== "Draft" && (c.progressPercentage || 0) < 100)
        setResume(open[0] || null)
      })
      .catch(() => {})
  }, [token, user])

  useEffect(() => {
    ;(async () => {
      try {
        const [c, k] = await Promise.all([
          // Only the featured four are shown; the total comes from the pagination.
          apiConnector("GET", courseEndpoints.GET_ALL_COURSE_API, null, null, { limit: 4 }),
          apiConnector("GET", categories.CATEGORIES_API),
        ])
        setCourses(c?.data?.data || [])
        setCourseTotal(c?.data?.pagination?.total ?? null)
        setCats((k?.data?.data || []).filter((x) => x?.courses?.length))
      } catch (error) {
        // The page still works without live data; those sections just hide.
      }
    })()
  }, [])

  const onSearch = (e) => {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    else navigate("/search")
  }

  return (
    <div>
      {/* Hero */}
      <section className="hero-glow">
        <div className="mx-auto grid w-11/12 max-w-maxContent items-center gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-richblack-600 bg-richblack-800 px-4 py-1.5 text-sm font-medium text-richblack-100">
              <span className="h-2 w-2 rounded-full bg-yellow-50" />
              New: quizzes &amp; verifiable certificates
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] text-richblack-5 sm:text-6xl">
              Learn skills that
              <HighlightText text={"actually move your career"} />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-richblack-200">
              Practical, project-based courses taught by people who do the work. Learn at your
              pace, track real progress and earn a certificate anyone can verify.
            </p>

            <form
              onSubmit={onSearch}
              className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-richblack-600 bg-richblack-800 p-1.5 shadow-card"
            >
              <Search size={20} className="ml-4 shrink-0 text-richblack-300" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to learn today?"
                aria-label="Search courses"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-richblack-5 outline-none placeholder:text-richblack-400"
              />
              <button type="submit" className="yellowButton shrink-0">
                Search
              </button>
            </form>

            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              {[
                [courseTotal ? String(courseTotal) : "-", "Live courses"],
                [cats.length ? String(cats.length) : "-", "Categories"],
                ["100%", "Self-paced"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="font-display text-3xl font-extrabold text-richblack-5">{value}</p>
                  <p className="text-sm text-richblack-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="overflow-hidden rounded-[2rem] border border-richblack-700 shadow-card [transform:rotate(1.5deg)]">
              <video className="block aspect-[4/3] w-full object-cover" muted loop autoPlay playsInline>
                <source src={Banner} type="video/mp4" />
              </video>
            </div>
            <div className="surface absolute -bottom-5 -left-3 flex items-center gap-3 px-4 py-3 sm:-left-8">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-yellow-50/15 text-yellow-50">
                <Award size={20} />
              </span>
              <div>
                <p className="text-sm font-bold text-richblack-5">Certificate earned</p>
                <p className="text-xs text-richblack-300">Verifiable by anyone</p>
              </div>
            </div>
            <div className="surface absolute -right-2 -top-4 flex items-center gap-2 px-4 py-2.5 sm:-right-6">
              <Star size={18} className="fill-brown-100 text-brown-100" />
              <p className="text-sm font-bold text-richblack-5">
                Rated by learners
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Continue learning (students only) */}
      {resume && (
        <section className="mx-auto w-11/12 max-w-maxContent pb-10">
          <Link
            to={`/view-course/${resume._id}/section/${resume.courseContent?.[0]?._id}/sub-section/${resume.courseContent?.[0]?.subSection?.[0]?._id}`}
            className="surface flex flex-col gap-4 p-4 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center"
          >
            <img src={resume.thumbnail} alt="" className="h-28 w-full rounded-xl object-cover sm:w-48" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-50">
                Continue learning
              </p>
              <p className="mt-1 truncate font-display text-xl font-bold text-richblack-5">
                {resume.courseName}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-richblack-700">
                  <div
                    className="h-full rounded-full bg-yellow-50"
                    style={{ width: `${resume.progressPercentage || 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-richblack-100">
                  {resume.progressPercentage || 0}%
                </span>
              </div>
            </div>
            <span className="yellowButton shrink-0 text-center">Resume</span>
          </Link>
        </section>
      )}

      {/* Categories */}
      {cats.length > 0 && (
        <section className="mx-auto w-11/12 max-w-maxContent pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="mr-2 text-sm font-semibold uppercase tracking-wide text-richblack-300">
              Browse
            </span>
            {cats.map((c) => (
              <Link
                key={c._id}
                to={`/catalog/${toSlug(c.name)}`}
                className="rounded-full border border-richblack-600 bg-richblack-800 px-4 py-2 text-sm font-medium text-richblack-25 transition-colors hover:border-yellow-50 hover:text-yellow-50"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured courses */}
      {courses.length > 0 && (
        <section className="mx-auto w-11/12 max-w-maxContent py-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-yellow-50">
                Featured
              </p>
              <h2 className="section_heading mt-1">Start with a popular course</h2>
            </div>
            <Link
              to="/search"
              className="hidden items-center gap-1 font-semibold text-yellow-50 hover:underline sm:flex"
            >
              View all <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {courses.slice(0, 4).map((course) => (
              <CourseCard key={course._id} course={course} Height="h-[170px]" />
            ))}
          </div>
        </section>
      )}

      {/* Why Learnify */}
      <section className="mx-auto w-11/12 max-w-maxContent py-12">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-yellow-50">
            Why Learnify
          </p>
          <h2 className="section_heading mt-1">Everything you need to actually finish</h2>
        </div>
        <WhyLearnify />
      </section>

      {/* How it works */}
      <section className="bg-richblack-800/60 py-20">
        <div className="mx-auto w-11/12 max-w-maxContent">
          <div className="mb-12 text-center">
            <h2 className="section_heading">
              How <HighlightText text={"Learnify"} /> works
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-richblack-300">
              Three steps between you and your next skill.
            </p>
          </div>
          <HowItWorks />
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <CTAButton active={true} linkto={"/search"}>
              <span className="flex items-center gap-2">
                Explore the catalog <ArrowRight size={18} />
              </span>
            </CTAButton>
            <CTAButton active={false} linkto={token ? landingPathFor(user) : "/signup"}>
              {token ? "Go to my dashboard" : "Sign up free"}
            </CTAButton>
          </div>
        </div>
      </section>

      {/* Instructors + Reviews */}
      <section className="mx-auto w-11/12 max-w-maxContent py-20">
        <InstructorSection />
        <ReviewSlider title="Reviews from other learners" />
      </section>

      <Footer />
    </div>
  )
}

export default Home

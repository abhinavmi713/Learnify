import { useEffect, useState } from "react"
import ProgressBar from "@ramonak/react-progress-bar"
import { useSelector } from "react-redux"
import { BookOpen } from "lucide-react"
import { useNavigate } from "react-router-dom"

import EmptyState from "../../Common/EmptyState"

import useTheme from "../../../hooks/useTheme"
import { themeColor } from "../../../utils/theme"
import { getUserEnrolledCourses } from "../../../services/operations/profileAPI"
import { getRecommendedCourses } from "../../../services/operations/courseDetailsAPI"
import { formatPrice } from "../../../utils/formatPrice"

export default function EnrolledCourses() {
  const { token } = useSelector((state) => state.auth)
  const navigate = useNavigate()
  useTheme()

  const [enrolledCourses, setEnrolledCourses] = useState(null)
  const [recommended, setRecommended] = useState([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await getUserEnrolledCourses(token) // Getting all the published and the drafted courses

        // Filtering the published course out
        const filterPublishCourse = res.filter((ele) => ele.status !== "Draft")
        // console.log(
        //   "Viewing all the couse that is Published",
        //   filterPublishCourse
        // )

        setEnrolledCourses(filterPublishCourse)
      } catch (error) {
        console.log("Could not fetch enrolled courses.")
      }
    })()
    getRecommendedCourses(token).then(setRecommended)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Enrolled courses</h1>
      {!enrolledCourses ? (
        <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
          <div className="spinner"></div>
        </div>
      ) : !enrolledCourses.length ? (
        <EmptyState
          icon={BookOpen}
          title="You haven't enrolled in a course yet"
          text="Find something you want to learn and it will show up here with your progress."
          actionLabel="Browse courses"
          actionTo="/search"
        />
      ) : (
        <div className="surface overflow-hidden text-richblack-5">
          {/* Headings */}
          <div className="flex border-b border-richblack-700 bg-richblack-900 text-xs font-semibold uppercase tracking-wide text-richblack-300">
            <p className="w-[45%] px-5 py-3">Course Name</p>
            <p className="w-1/4 px-2 py-3">Duration</p>
            <p className="flex-1 px-2 py-3">Progress</p>
          </div>
          {/* Course Names */}
          {enrolledCourses.map((course, i, arr) => (
            <div
              className={`flex items-center ${
                i === arr.length - 1 ? "" : "border-b border-richblack-700"
              }`}
              key={i}
            >
              <div
                className="flex w-[45%] cursor-pointer items-center gap-4 px-5 py-3"
                onClick={() => {
                  navigate(
                    `/view-course/${course?._id}/section/${course.courseContent?.[0]?._id}/sub-section/${course.courseContent?.[0]?.subSection?.[0]?._id}`
                  )
                }}
              >
                <img
                  src={course.thumbnail}
                  alt="course_img"
                  className="h-14 w-14 rounded-lg object-cover"
                />
                <div className="flex max-w-xs flex-col gap-2">
                  <p className="font-semibold">{course.courseName}</p>
                  <p className="text-xs text-richblack-300">
                    {course.courseDescription.length > 50
                      ? `${course.courseDescription.slice(0, 50)}...`
                      : course.courseDescription}
                  </p>
                </div>
              </div>
              <div className="w-1/4 px-2 py-3">{course?.totalDuration}</div>
              <div className="flex w-1/5 flex-col gap-2 px-2 py-3">
                <p>Progress: {course.progressPercentage || 0}%</p>
                <ProgressBar
                  completed={course.progressPercentage || 0}
                  height="8px"
                  isLabelVisible={false}
                  bgColor={themeColor("yellow-50")}
                  baseBgColor={themeColor("richblack-700")}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {recommended.length > 0 && (
        <div className="mt-10">
          <p className="mb-4 text-xl font-semibold text-richblack-5">Recommended for You</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recommended.map((course) => (
              <div
                key={course._id}
                onClick={() => navigate(`/courses/${course._id}`)}
                className="cursor-pointer overflow-hidden rounded-lg border border-richblack-700 bg-richblack-800 transition-transform hover:-translate-y-1"
              >
                <img
                  src={course.thumbnail}
                  alt={course.courseName}
                  className="h-32 w-full object-cover"
                />
                <div className="p-3">
                  <p className="line-clamp-1 font-semibold text-richblack-5">{course.courseName}</p>
                  <p className="mt-1 text-xs text-richblack-400">
                    {course.instructor?.firstName} {course.instructor?.lastName}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-yellow-50">{formatPrice(course.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

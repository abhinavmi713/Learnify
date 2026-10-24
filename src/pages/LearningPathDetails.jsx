import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getLearningPathDetails } from "../services/operations/learningPathAPI"

export default function LearningPathDetails() {
  const { pathId } = useParams()
  const [path, setPath] = useState(null)

  useEffect(() => {
    getLearningPathDetails(pathId).then(setPath)
  }, [pathId])

  if (path === null) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-11/12 max-w-3xl py-10">
      <Link to="/learning-paths" className="mb-4 inline-block text-sm text-richblack-300 hover:text-richblack-100">
        ← All Learning Paths
      </Link>
      <h1 className="mb-2 text-3xl font-semibold text-richblack-5">{path.title}</h1>
      {path.description && <p className="mb-8 text-richblack-300">{path.description}</p>}

      <div className="flex flex-col gap-4">
        {path.courses.map((course, index) => (
          <Link
            key={course._id}
            to={`/courses/${course._id}`}
            className="flex items-center gap-4 surface p-4 transition-colors hover:border-richblack-500"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-richblack-700 font-semibold text-richblack-5">
              {index + 1}
            </div>
            <img src={course.thumbnail} alt={course.courseName} className="h-16 w-24 rounded-lg object-cover" />
            <div className="flex-1">
              <p className="font-semibold text-richblack-5">{course.courseName}</p>
              <p className="line-clamp-1 text-sm text-richblack-400">{course.courseDescription}</p>
              <p className="text-xs text-richblack-300">
                {course.instructor?.firstName} {course.instructor?.lastName}
              </p>
            </div>
            <p className="shrink-0 font-semibold text-yellow-50">₹{course.price}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

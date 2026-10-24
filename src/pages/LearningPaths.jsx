import { Route as RouteIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { getAllLearningPaths } from "../services/operations/learningPathAPI"

export default function LearningPaths() {
  const [paths, setPaths] = useState(null)

  useEffect(() => {
    getAllLearningPaths().then(setPaths)
  }, [])

  return (
    <div className="mx-auto w-11/12 max-w-maxContent py-10">
      <h1 className="mb-2 text-3xl font-semibold text-richblack-5">Learning Paths</h1>
      <p className="mb-8 text-richblack-300">
        Curated course sequences to guide you from beginner to job-ready, step by step.
      </p>

      {paths === null ? (
        <div className="grid place-items-center py-20">
          <div className="spinner"></div>
        </div>
      ) : paths.length === 0 ? (
        <p className="text-richblack-300">No learning paths published yet — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <Link
              key={path._id}
              to={`/learning-paths/${path._id}`}
              className="flex flex-col gap-3 surface p-6 transition-transform hover:-translate-y-1"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-yellow-50/10 text-yellow-50">
                <RouteIcon size={20} />
              </div>
              <p className="text-lg font-semibold text-richblack-5">{path.title}</p>
              {path.description && <p className="text-sm text-richblack-300">{path.description}</p>}
              <p className="mt-auto text-xs text-richblack-400">
                {path.courses?.length || 0} course{path.courses?.length === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

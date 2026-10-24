import { useEffect, useState } from "react"
import { Heart } from "lucide-react"
import { useSelector } from "react-redux"

import EmptyState from "../../Common/EmptyState"

import CourseCard from "../Catalog/Course_Card"
import { getWishlist } from "../../../services/operations/wishlistAPI"

export default function Wishlist() {
  const { token } = useSelector((state) => state.auth)
  const [courses, setCourses] = useState(null)

  useEffect(() => {
    ;(async () => {
      const data = await getWishlist(token)
      setCourses(data)
    })()
  }, [token])

  if (!courses) {
    return (
      <div className="grid place-items-center py-20">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">My Wishlist</h1>
      {courses.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No saved courses yet"
          text="Tap the heart on any course to save it for later."
          actionLabel="Browse courses"
          actionTo="/search"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard course={course} key={course._id} Height="h-[180px]" />
          ))}
        </div>
      )}
    </div>
  )
}

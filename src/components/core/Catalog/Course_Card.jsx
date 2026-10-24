import { Heart } from "lucide-react"
import { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { Link } from "react-router-dom"
import { toast } from "react-hot-toast"

import { toggleWishlist } from "../../../services/operations/wishlistAPI"
import { ACCOUNT_TYPE } from "../../../utils/constants"
import GetAvgRating from "../../../utils/avgRating"
import RatingStars from "../../Common/RatingStars"

function Course_Card({ course, Height }) {
  const [avgReviewCount, setAvgReviewCount] = useState(0)
  const dispatch = useDispatch()
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const { wishlistIds } = useSelector((state) => state.wishlist)
  const isWishlisted = wishlistIds.includes(course._id)

  useEffect(() => {
    const count = GetAvgRating(course.ratingAndReviews)
    setAvgReviewCount(count)
  }, [course])

  const handleWishlistClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!token) {
      toast.error("Please log in to use your wishlist")
      return
    }
    dispatch(toggleWishlist(course._id, isWishlisted, token))
  }

  return (
    <Link to={`/courses/${course._id}`} className="group block h-full">
      <div className="surface relative flex h-full flex-col overflow-hidden p-3 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-yellow-50/50">
        <div className="relative overflow-hidden rounded-xl">
          <img
            src={course?.thumbnail}
            alt="course thumbnail"
            className={`${Height || "h-[180px]"} w-full object-cover transition-transform duration-500 group-hover:scale-105`}
          />
          {(!user || user?.accountType === ACCOUNT_TYPE.STUDENT) && (
            <button
              onClick={handleWishlistClick}
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-richblack-800/90 shadow backdrop-blur-sm transition-colors hover:bg-richblack-800"
            >
              <Heart
                size={16}
                className={isWishlisted ? "fill-pink-200 text-pink-200" : "text-richblack-5"}
              />
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-1 pb-1 pt-4">
          <p className="line-clamp-2 font-display text-lg font-bold leading-snug text-richblack-5">
            {course?.courseName}
          </p>
          <p className="text-sm text-richblack-300">
            {course?.instructor?.firstName} {course?.instructor?.lastName}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-richblack-5">{avgReviewCount || 0}</span>
            <RatingStars Review_Count={avgReviewCount} Star_Size={16} />
            <span className="text-richblack-400">({course?.ratingAndReviews?.length || 0})</span>
          </div>
          <p className="mt-auto pt-2 text-lg font-bold text-yellow-50">
            {course?.price ? `₹${course.price}` : "Free"}
          </p>
        </div>
      </div>
    </Link>
  )
}

export default Course_Card

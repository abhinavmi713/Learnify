import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"

import { ShoppingCart } from "lucide-react"

import EmptyState from "../../../Common/EmptyState"
import RenderCartCourses from "./RenderCartCourses"
import RenderTotalAmount from "./RenderTotalAmount"
import { getUserEnrolledCourses } from "../../../../services/operations/profileAPI"
import { removeCourses } from "../../../../slices/cartSlice"

export default function Cart() {
  const { totalItems } = useSelector((state) => state.cart)
  const { paymentLoading } = useSelector((state) => state.course)
  const { token } = useSelector((state) => state.auth)
  const dispatch = useDispatch()

  // The cart lives in this browser; drop anything the student has meanwhile
  // enrolled in (bought on another device, enrolled for free, gifted...).
  useEffect(() => {
    if (!token) return
    getUserEnrolledCourses(token)
      .then((enrolled) => dispatch(removeCourses((enrolled || []).map((c) => c._id))))
      .catch(() => {})
  }, [token, dispatch])

  if (paymentLoading)
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="spinner"></div>
      </div>
    )

  return (
    <>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Cart</h1>
      {/* By item count, not total: a cart of free courses is not empty. */}
      {totalItems > 0 ? (
        <div className="flex flex-col-reverse items-start gap-x-10 gap-y-6 lg:flex-row">
          <RenderCartCourses />
          <RenderTotalAmount />
        </div>
      ) : (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          text="Courses you add will wait for you here."
          actionLabel="Browse courses"
          actionTo="/search"
        />
      )}
    </>
  )
}

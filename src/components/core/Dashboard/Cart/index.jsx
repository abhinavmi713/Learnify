import { useSelector } from "react-redux"

import { ShoppingCart } from "lucide-react"

import EmptyState from "../../../Common/EmptyState"
import RenderCartCourses from "./RenderCartCourses"
import RenderTotalAmount from "./RenderTotalAmount"

export default function Cart() {
  const { total } = useSelector((state) => state.cart)
  const { paymentLoading } = useSelector((state) => state.course)

  if (paymentLoading)
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="spinner"></div>
      </div>
    )

  return (
    <>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Cart</h1>
      {total > 0 ? (
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

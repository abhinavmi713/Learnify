import { Tag, X } from "lucide-react"
import { useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { clearAppliedCoupon } from "../../../../slices/cartSlice"
import { applyCoupon } from "../../../../services/operations/couponAPI"
import { BuyCourse } from "../../../../services/operations/studentFeaturesAPI"
import IconBtn from "../../../Common/IconBtn"

export default function RenderTotalAmount() {
  const { total, cart, appliedCoupon } = useSelector((state) => state.cart)
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [couponInput, setCouponInput] = useState("")
  const [applying, setApplying] = useState(false)

  const finalTotal = appliedCoupon ? appliedCoupon.total : total

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    const courseIds = cart.map((course) => course._id)
    setApplying(true)
    await dispatch(applyCoupon(couponInput.trim(), courseIds, token))
    setApplying(false)
  }

  const handleBuyCourse = () => {
    const courses = cart.map((course) => course._id)
    BuyCourse(token, courses, user, navigate, dispatch, appliedCoupon?.code)
  }

  return (
    <div className="min-w-[280px] surface p-6">
      {/* Coupon */}
      {appliedCoupon ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-caribbeangreen-300 bg-caribbeangreen-900/30 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-caribbeangreen-100">
            <Tag size={16} />
            <span className="font-semibold">{appliedCoupon.code}</span>
            <span className="text-richblack-300">applied</span>
          </div>
          <button
            onClick={() => dispatch(clearAppliedCoupon())}
            aria-label="Remove coupon"
            className="text-richblack-300 hover:text-richblack-100"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="mb-4 flex gap-2">
          <input
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            placeholder="Coupon code"
            className="w-0 flex-1 rounded-lg border border-richblack-600 bg-richblack-900 px-3 py-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
          />
          <button
            onClick={handleApplyCoupon}
            disabled={applying || !couponInput.trim()}
            className="rounded-lg border border-richblack-600 px-3 py-2 text-sm font-medium text-richblack-100 transition-colors hover:border-richblack-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {appliedCoupon && (
        <div className="mb-2 flex justify-between text-sm text-richblack-300">
          <span>Subtotal</span>
          <span>₹ {appliedCoupon.subtotal}</span>
        </div>
      )}
      {appliedCoupon && (
        <div className="mb-2 flex justify-between text-sm text-caribbeangreen-100">
          <span>Discount</span>
          <span>− ₹ {appliedCoupon.discount}</span>
        </div>
      )}

      <p className="mb-1 text-sm font-medium text-richblack-300">Total:</p>
      <p className="mb-6 text-3xl font-medium text-yellow-50">₹ {finalTotal}</p>
      <IconBtn
        text={finalTotal === 0 ? "Enroll for Free" : "Buy Now"}
        onclick={handleBuyCourse}
        customClasses="w-full justify-center"
      />
    </div>
  )
}

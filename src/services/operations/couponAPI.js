import { toast } from "react-hot-toast"

import { setAppliedCoupon } from "../../slices/cartSlice"
import { apiConnector } from "../apiConnector"
import { couponEndpoints } from "../apis"

const { VALIDATE_COUPON_API } = couponEndpoints

export function applyCoupon(code, courseIds, token) {
  return async (dispatch) => {
    const toastId = toast.loading("Applying coupon...")
    try {
      const response = await apiConnector(
        "POST",
        VALIDATE_COUPON_API,
        { code, courses: courseIds },
        { Authorization: `Bearer ${token}` }
      )
      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Invalid coupon")
      }
      dispatch(setAppliedCoupon(response.data.data))
      toast.success(`Coupon applied — you saved ₹${response.data.data.discount}`)
    } catch (error) {
      console.log("APPLY_COUPON ERROR............", error)
      toast.error(error?.response?.data?.message || error.message || "Invalid coupon")
    }
    toast.dismiss(toastId)
  }
}

import { toast } from "react-hot-toast"

import rzpLogo from "../../assets/Logo/rzp_logo.png"
import { removeCourses } from "../../slices/cartSlice"
import { setPaymentLoading } from "../../slices/courseSlice"
import { apiConnector } from "../apiConnector"
import { idempotencyKey } from "../../utils/idempotencyKey"
import { studentEndpoints } from "../apis"
import { devLog } from "../../utils/devLog"

const {
  COURSE_PAYMENT_API,
  COURSE_VERIFY_API,
} = studentEndpoints

// Load the Razorpay SDK from the CDN
function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script")
    script.src = src
    script.onload = () => {
      resolve(true)
    }
    script.onerror = () => {
      resolve(false)
    }
    document.body.appendChild(script)
  })
}

// Buy the Course
export async function BuyCourse(
  token,
  courses,
  user_details,
  navigate,
  dispatch,
  couponCode
) {
  const toastId = toast.loading("Loading...")
  try {
    // Initiating the Order in Backend
    const orderResponse = await apiConnector(
      "POST",
      COURSE_PAYMENT_API,
      {
        courses,
        ...(couponCode ? { couponCode } : {}),
      },
      {
        // Same cart + coupon = same key: a double click creates one order.
        "Idempotency-Key": idempotencyKey("checkout", user_details?._id || "", [...courses].sort(), couponCode || ""),
      }
    )

    if (!orderResponse.data.success) {
      throw new Error(orderResponse.data.message)
    }
    devLog("PAYMENT RESPONSE FROM BACKEND............", orderResponse.data)

    // A 100%-off coupon enrolls directly with no Razorpay checkout at all.
    if (orderResponse.data.freeEnrollment) {
      toast.success("Enrolled successfully!")
      navigate("/dashboard/enrolled-courses")
      // Only the purchased courses leave the cart ("Buy now" on one course
      // used to empty the whole cart).
      dispatch(removeCourses(courses))
      toast.dismiss(toastId)
      return
    }

    // Loading the script of Razorpay SDK
    const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js")

    if (!res) {
      toast.error(
        "Razorpay SDK failed to load. Check your Internet Connection."
      )
      toast.dismiss(toastId)
      return
    }

    // Opening the Razorpay SDK
    const options = {
      key: process.env.REACT_APP_RAZORPAY_KEY,
      currency: orderResponse.data.data.currency,
      amount: `${orderResponse.data.data.amount}`,
      order_id: orderResponse.data.data.id,
      name: "Learnify",
      description: "Thank you for Purchasing the Course.",
      image: rzpLogo,
      prefill: {
        name: `${user_details.firstName} ${user_details.lastName}`,
        email: user_details.email,
      },
      handler: function (response) {
        verifyPayment({ ...response, courses }, token, navigate, dispatch)
      },
    }
    const paymentObject = new window.Razorpay(options)

    paymentObject.open()
    paymentObject.on("payment.failed", function (response) {
      toast.error("Oops! Payment Failed.")
      devLog(response.error)
    })
  } catch (error) {
    devLog("PAYMENT API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could Not make Payment.")
  }
  toast.dismiss(toastId)
}

// Verify the Payment
async function verifyPayment(bodyData, token, navigate, dispatch) {
  const toastId = toast.loading("Verifying Payment...")
  dispatch(setPaymentLoading(true))
  try {
    const send = () =>
      apiConnector("POST", COURSE_VERIFY_API, bodyData, {
        // The payment id is unique, so retries of this verification are replayed.
        ...(bodyData?.razorpay_payment_id ? { "Idempotency-Key": `verify-${bodyData.razorpay_payment_id}` } : {}),
      })
    // The money has already been taken, so a brief failure is worth retrying.
    let response
    for (let attempt = 1; ; attempt++) {
      try {
        response = await send()
        break
      } catch (error) {
        const status = error?.response?.status
        const temporary = !status || status >= 500 || status === 409
        if (!temporary || attempt === 3) throw error
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      }
    }

    devLog("VERIFY PAYMENT RESPONSE FROM BACKEND............", response)

    if (!response.data.success) {
      throw new Error(response.data.message)
    }

    toast.success("Payment Successful. You are Added to the course ")
    navigate("/dashboard/enrolled-courses")
    dispatch(removeCourses(bodyData.courses))
  } catch (error) {
    devLog("PAYMENT VERIFY ERROR............", error)
    toast.error(error?.response?.data?.message || "Could Not Verify Payment.")
  }
  toast.dismiss(toastId)
  dispatch(setPaymentLoading(false))
}


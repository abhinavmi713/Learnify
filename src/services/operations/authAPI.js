import { landingPathFor } from "../../utils/landing"
import { toast } from "react-hot-toast"

import { setLoading, setToken, setTwoFactorChallenge } from "../../slices/authSlice"
import { resetCart } from "../../slices/cartSlice"
import { setUser } from "../../slices/profileSlice"
import { apiConnector } from "../apiConnector"
import { endpoints } from "../apis"

const {
  SENDOTP_API,
  SIGNUP_API,
  LOGIN_API,
  LOGOUT_API,
  LOGIN_2FA_API,
  RESETPASSTOKEN_API,
  RESETPASSWORD_API,
} = endpoints

export function sendOtp(email, navigate) {
  return async (dispatch) => {
    const toastId = toast.loading("Loading...")
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("POST", SENDOTP_API, {
        email,
        checkUserPresent: true,
      })
      console.log("SENDOTP API RESPONSE............", response)

      console.log(response.data.success)

      if (!response.data.success) {
        throw new Error(response.data.message)
      }

      toast.success("OTP Sent Successfully")
      navigate("/verify-email")
    } catch (error) {
      console.log("SENDOTP API ERROR............", error)
      toast.error(error?.response?.data?.message || "Could Not Send OTP")
    }
    dispatch(setLoading(false))
    toast.dismiss(toastId)
  }
}

export function signUp(
  accountType,
  firstName,
  lastName,
  email,
  password,
  confirmPassword,
  otp,
  navigate
) {
  return async (dispatch) => {
    const toastId = toast.loading("Loading...")
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("POST", SIGNUP_API, {
        accountType,
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
        otp,
      })

      console.log("SIGNUP API RESPONSE............", response)

      if (!response.data.success) {
        throw new Error(response.data.message)
      }
      toast.success("Signup Successful")
      navigate("/login")
    } catch (error) {
      console.log("SIGNUP API ERROR............", error)
      toast.error(error?.response?.data?.message || "Signup Failed")
      navigate("/signup")
    }
    dispatch(setLoading(false))
    toast.dismiss(toastId)
  }
}

// Stores the new session and leaves the login page.
function finishLogin(dispatch, data, navigate) {
  dispatch(setTwoFactorChallenge(null))
  toast.success("Login Successful")
  dispatch(setToken(data.token))
  const userImage = data?.user?.image
    ? data.user.image
    : `https://api.dicebear.com/5.x/initials/svg?seed=${data.user.firstName} ${data.user.lastName}`
  dispatch(setUser({ ...data.user, image: userImage }))
  localStorage.setItem("token", JSON.stringify(data.token))
  navigate(landingPathFor(data.user))
}

// Logs in, or, when the account has two-factor authentication, stores the
// challenge so the form asks for the code.
export function login(email, password, navigate) {
  return async (dispatch) => {
    const toastId = toast.loading("Loading...")
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("POST", LOGIN_API, {
        email,
        password,
      })

      if (!response.data.success) {
        throw new Error(response.data.message)
      }

      if (response.data.twoFactorRequired) {
        dispatch(setTwoFactorChallenge(response.data.challenge))
      } else {
        finishLogin(dispatch, response.data, navigate)
      }
    } catch (error) {
      console.log("LOGIN API ERROR............", error)
      toast.error(error?.response?.data?.message || "Login Failed")
    }
    dispatch(setLoading(false))
    toast.dismiss(toastId)
  }
}

// Second login step: authenticator code or a recovery code.
export function loginWithTwoFactor(challenge, code, navigate) {
  return async (dispatch) => {
    dispatch(setLoading(true))
    let ok = false
    try {
      const response = await apiConnector("POST", LOGIN_2FA_API, { challenge, code })
      if (!response.data.success) throw new Error(response.data.message)
      finishLogin(dispatch, response.data, navigate)
      ok = true
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not verify the code")
    }
    dispatch(setLoading(false))
    return ok
  }
}

export function getPasswordResetToken(email, setEmailSent) {
  return async (dispatch) => {
    const toastId = toast.loading("Loading...")
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("POST", RESETPASSTOKEN_API, {
        email,
      })

      console.log("RESETPASSTOKEN RESPONSE............", response)

      if (!response.data.success) {
        throw new Error(response.data.message)
      }

      toast.success("Reset Email Sent")
      setEmailSent(true)
    } catch (error) {
      console.log("RESETPASSTOKEN ERROR............", error)
      toast.error("Failed To Send Reset Email")
    }
    toast.dismiss(toastId)
    dispatch(setLoading(false))
  }
}

export function resetPassword(password, confirmPassword, token, navigate) {
  return async (dispatch) => {
    const toastId = toast.loading("Loading...")
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("POST", RESETPASSWORD_API, {
        password,
        confirmPassword,
        token,
      })

      console.log("RESETPASSWORD RESPONSE............", response)

      if (!response.data.success) {
        throw new Error(response.data.message)
      }

      toast.success("Password Reset Successfully")
      navigate("/login")
    } catch (error) {
      console.log("RESETPASSWORD ERROR............", error)
      toast.error(error?.response?.data?.message || "Failed To Reset Password")
    }
    toast.dismiss(toastId)
    dispatch(setLoading(false))
  }
}

export function logout(navigate) {
  return (dispatch, getState) => {
    // Revoke the session on the server too (best effort: the user is logged out
    // locally either way).
    // The refresh cookie identifies the session even if the access token has
    // already expired, so this is always sent.
    const token = getState()?.auth?.token
    apiConnector("POST", LOGOUT_API, null, token ? { Authorization: `Bearer ${token}` } : {}).catch(() => {})
    dispatch(setToken(null))
    dispatch(setUser(null))
    dispatch(resetCart())
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    toast.success("Logged Out")
    navigate("/")
  }
}

import { useState } from "react"
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai"
import { useDispatch, useSelector } from "react-redux"
import { Link, useNavigate } from "react-router-dom"

import { login, loginWithTwoFactor } from "../../../services/operations/authAPI"
import { setTwoFactorChallenge } from "../../../slices/authSlice"

function LoginForm() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })

  const [showPassword, setShowPassword] = useState(false)
  // Set when the password was right and the account has two-factor auth on.
  const challenge = useSelector((state) => state.auth.twoFactorChallenge)
  const setChallenge = (value) => dispatch(setTwoFactorChallenge(value))
  const [code, setCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)

  const { email, password } = formData

  const handleOnChange = (e) => {
    setFormData((prevData) => ({
      ...prevData,
      [e.target.name]: e.target.value,
    }))
  }

  const handleOnSubmit = (e) => {
    e.preventDefault()
    dispatch(login(email, password, navigate))
  }

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    const ok = await dispatch(loginWithTwoFactor(challenge, code.trim(), navigate))
    if (!ok) setCode("")
  }

  if (challenge) {
    return (
      <form onSubmit={handleCodeSubmit} className="mt-6 flex w-full flex-col gap-y-4">
        <div>
          <p className="text-lg font-semibold text-richblack-5">Two-factor authentication</p>
          <p className="mt-1 text-sm text-richblack-300">
            {useRecovery
              ? "Enter one of the recovery codes you saved when you turned on two-factor authentication."
              : "Open your authenticator app and enter the 6-digit code for Learnify."}
          </p>
        </div>
        <label className="w-full">
          <p className="mb-1 text-[0.875rem] leading-[1.375rem] text-richblack-5">
            {useRecovery ? "Recovery code" : "Authentication code"} <sup className="text-pink-200">*</sup>
          </p>
          <input
            required
            autoFocus
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
            maxLength={useRecovery ? 11 : 6}
            className="form-style w-full tracking-widest"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v)
            setCode("")
          }}
          className="ml-auto max-w-max text-xs text-blue-100"
        >
          {useRecovery ? "Use authenticator code instead" : "Lost your device? Use a recovery code"}
        </button>
        <button
          type="submit"
          className="mt-2 rounded-[8px] bg-yellow-50 py-[8px] px-[12px] font-medium text-richblack-900"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => {
            setChallenge(null)
            setCode("")
          }}
          className="text-sm text-richblack-300 hover:text-richblack-5"
        >
          Back to sign in
        </button>
      </form>
    )
  }

  return (
    <form
      onSubmit={handleOnSubmit}
      className="mt-6 flex w-full flex-col gap-y-4"
    >
      <label className="w-full">
        <p className="mb-1 text-[0.875rem] leading-[1.375rem] text-richblack-5">
          Email Address <sup className="text-pink-200">*</sup>
        </p>
        <input
          required
          type="text"
          name="email"
          value={email}
          onChange={handleOnChange}
          placeholder="Enter email address"
          className="form-style w-full"
        />
      </label>
      <label className="relative">
        <p className="mb-1 text-[0.875rem] leading-[1.375rem] text-richblack-5">
          Password <sup className="text-pink-200">*</sup>
        </p>
        <input
          required
          type={showPassword ? "text" : "password"}
          name="password"
          value={password}
          onChange={handleOnChange}
          placeholder="Enter Password"
          className="form-style w-full !pr-10"
        />
        <span
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-[38px] z-[10] cursor-pointer"
        >
          {showPassword ? (
            <AiOutlineEyeInvisible fontSize={24} className="fill-richblack-300" />
          ) : (
            <AiOutlineEye fontSize={24} className="fill-richblack-300" />
          )}
        </span>
        <Link to="/forgot-password">
          <p className="mt-1 ml-auto max-w-max text-xs text-blue-100">
            Forgot Password
          </p>
        </Link>
      </label>
      <button
        type="submit"
        className="mt-6 rounded-[8px] bg-yellow-50 py-[8px] px-[12px] font-medium text-richblack-900"
      >
        Sign In
      </button>
    </form>
  )
}

export default LoginForm

import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { securityEndpoints } from "../apis"

const {
  SESSIONS_API,
  REVOKE_SESSION_API,
  LOGOUT_ALL_API,
  TWO_FA_SETUP_API,
  TWO_FA_ENABLE_API,
  TWO_FA_DISABLE_API,
} = securityEndpoints

const auth = (token) => ({ Authorization: `Bearer ${token}` })
const message = (error, fallback) => error?.response?.data?.message || fallback

export async function getSessions(token) {
  try {
    const res = await apiConnector("GET", SESSIONS_API, null, auth(token))
    return res.data.data
  } catch (error) {
    toast.error(message(error, "Could not load your sessions"))
    return null
  }
}

export async function revokeSession(token, sessionId) {
  try {
    await apiConnector("POST", REVOKE_SESSION_API, { sessionId }, auth(token))
    toast.success("Signed out of that device")
    return true
  } catch (error) {
    toast.error(message(error, "Could not sign out that session"))
    return false
  }
}

export async function logoutEverywhere(token) {
  try {
    await apiConnector("POST", LOGOUT_ALL_API, null, auth(token))
    return true
  } catch (error) {
    toast.error(message(error, "Could not sign out everywhere"))
    return false
  }
}

export async function startTwoFactorSetup(token) {
  try {
    const res = await apiConnector("POST", TWO_FA_SETUP_API, null, auth(token))
    return res.data.data
  } catch (error) {
    toast.error(message(error, "Could not start two-factor setup"))
    return null
  }
}

export async function enableTwoFactor(token, code) {
  try {
    const res = await apiConnector("POST", TWO_FA_ENABLE_API, { code }, auth(token))
    toast.success("Two-factor authentication is on")
    return res.data.data.recoveryCodes
  } catch (error) {
    toast.error(message(error, "That code is not valid"))
    return null
  }
}

export async function disableTwoFactor(token, password, code) {
  try {
    await apiConnector("POST", TWO_FA_DISABLE_API, { password, code }, auth(token))
    toast.success("Two-factor authentication is off")
    return true
  } catch (error) {
    toast.error(message(error, "Password or code is not valid"))
    return false
  }
}

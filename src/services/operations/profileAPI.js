import { toast } from "react-hot-toast"

import { setLoading, setUser } from "../../slices/profileSlice"
import { apiConnector } from "../apiConnector"
import { profileEndpoints } from "../apis"
import { logout } from "./authAPI"
import { devLog } from "../../utils/devLog"

const {
  GET_USER_DETAILS_API,
  GET_USER_ENROLLED_COURSES_API,
  GET_INSTRUCTOR_DATA_API,
} = profileEndpoints

export function getUserDetails(token, navigate) {
  return async (dispatch) => {
    dispatch(setLoading(true))
    try {
      const response = await apiConnector("GET", GET_USER_DETAILS_API, null, null)
      devLog("GET_USER_DETAILS API RESPONSE............", response)

      if (!response.data.success) {
        throw new Error(response.data.message)
      }
      const userImage = response.data.data.image
        ? response.data.data.image
        : `https://api.dicebear.com/5.x/initials/svg?seed=${response.data.data.firstName} ${response.data.data.lastName}`
      dispatch(setUser({ ...response.data.data, image: userImage }))
    } catch (error) {
      devLog("GET_USER_DETAILS API ERROR............", error)
      // Only a rejected session means logging out. An outage must not sign people out.
      if (error?.response?.status === 401) dispatch(logout(navigate))
      toast.error("Could Not Get User Details")
    }
    dispatch(setLoading(false))
  }
}

export async function getUserEnrolledCourses(token) {
  let result = []
  try {
    const response = await apiConnector(
      "GET",
      GET_USER_ENROLLED_COURSES_API,
      null,
      null
    )
    // devLog(
    //   "GET_USER_ENROLLED_COURSES_API API RESPONSE............",
    //   response
    // )

    if (!response.data.success) {
      throw new Error(response.data.message)
    }
    result = response.data.data
  } catch (error) {
    devLog("GET_USER_ENROLLED_COURSES_API API ERROR............", error)
    toast.error("Could Not Get Enrolled Courses")
  }
  return result
}

export async function getMyBadges(token) {
  try {
    const response = await apiConnector("GET", profileEndpoints.GET_MY_BADGES_API, null, null)
    return response?.data?.data || []
  } catch (error) {
    devLog("GET_MY_BADGES_API ERROR............", error)
    return []
  }
}

export async function getInstructorData(token) {
  let result = { courses: [], enrollmentTrend: [] }
  try {
    const response = await apiConnector("GET", GET_INSTRUCTOR_DATA_API, null, null)
    devLog("GET_INSTRUCTOR_DATA_API API RESPONSE............", response)
    result = {
      courses: response?.data?.courses || [],
      enrollmentTrend: response?.data?.enrollmentTrend || [],
    }
  } catch (error) {
    devLog("GET_INSTRUCTOR_DATA_API API ERROR............", error)
    toast.error("Could Not Get Instructor Data")
  }
  return result
}

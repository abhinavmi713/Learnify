import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { liveClassEndpoints } from "../apis"

const {
  CREATE_LIVE_CLASS_API,
  GET_INSTRUCTOR_LIVE_CLASSES_API,
  GET_STUDENT_LIVE_CLASSES_API,
  DELETE_LIVE_CLASS_API,
} = liveClassEndpoints

export async function createLiveClass(data, token) {
  try {
    const response = await apiConnector("POST", CREATE_LIVE_CLASS_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    toast.success("Live class scheduled")
    return response.data.data
  } catch (error) {
    console.log("CREATE_LIVE_CLASS_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not schedule live class")
    return null
  }
}

export async function getInstructorLiveClasses(token) {
  try {
    const response = await apiConnector("GET", GET_INSTRUCTOR_LIVE_CLASSES_API, null, {
      Authorization: `Bearer ${token}`,
    })
    return response?.data?.data || []
  } catch (error) {
    console.log("GET_INSTRUCTOR_LIVE_CLASSES_API ERROR............", error)
    return []
  }
}

export async function getStudentLiveClasses(token) {
  try {
    const response = await apiConnector("GET", GET_STUDENT_LIVE_CLASSES_API, null, {
      Authorization: `Bearer ${token}`,
    })
    return response?.data?.data || []
  } catch (error) {
    console.log("GET_STUDENT_LIVE_CLASSES_API ERROR............", error)
    return []
  }
}

export async function deleteLiveClass(liveClassId, token) {
  try {
    const response = await apiConnector(
      "POST",
      DELETE_LIVE_CLASS_API,
      { liveClassId },
      { Authorization: `Bearer ${token}` }
    )
    toast.success("Live class cancelled")
    return !!response?.data?.success
  } catch (error) {
    console.log("DELETE_LIVE_CLASS_API ERROR............", error)
    toast.error("Could not cancel live class")
    return false
  }
}

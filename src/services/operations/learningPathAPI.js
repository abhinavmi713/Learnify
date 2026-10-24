import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { learningPathEndpoints } from "../apis"

const {
  GET_ALL_LEARNING_PATHS_API,
  GET_LEARNING_PATH_DETAILS_API,
  CREATE_LEARNING_PATH_API,
  UPDATE_LEARNING_PATH_API,
  DELETE_LEARNING_PATH_API,
} = learningPathEndpoints

export async function getAllLearningPaths() {
  try {
    const response = await apiConnector("GET", GET_ALL_LEARNING_PATHS_API)
    return response?.data?.data || []
  } catch (error) {
    console.log("GET_ALL_LEARNING_PATHS_API ERROR............", error)
    return []
  }
}

// Paginated variant for the admin list (the public page just wants the array).
export async function getLearningPathsPage(page = 1) {
  try {
    const response = await apiConnector("GET", GET_ALL_LEARNING_PATHS_API, null, null, { page })
    return { items: response?.data?.data || [], pagination: response?.data?.pagination || null }
  } catch (error) {
    console.log("GET_ALL_LEARNING_PATHS_API ERROR............", error)
    return { items: [], pagination: null }
  }
}

export async function getLearningPathDetails(pathId) {
  try {
    const response = await apiConnector("GET", `${GET_LEARNING_PATH_DETAILS_API}/${pathId}`)
    return response?.data?.data || null
  } catch (error) {
    console.log("GET_LEARNING_PATH_DETAILS_API ERROR............", error)
    return null
  }
}

export async function createLearningPath(data, token) {
  try {
    const response = await apiConnector("POST", CREATE_LEARNING_PATH_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    toast.success("Learning path created")
    return true
  } catch (error) {
    console.log("CREATE_LEARNING_PATH_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not create learning path")
    return false
  }
}

export async function updateLearningPath(data, token) {
  try {
    const response = await apiConnector("POST", UPDATE_LEARNING_PATH_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    toast.success("Learning path updated")
    return true
  } catch (error) {
    console.log("UPDATE_LEARNING_PATH_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not update learning path")
    return false
  }
}

export async function deleteLearningPath(pathId, token) {
  try {
    const response = await apiConnector(
      "POST",
      DELETE_LEARNING_PATH_API,
      { pathId },
      { Authorization: `Bearer ${token}` }
    )
    if (!response?.data?.success) throw new Error(response?.data?.message)
    toast.success("Learning path deleted")
    return true
  } catch (error) {
    console.log("DELETE_LEARNING_PATH_API ERROR............", error)
    toast.error("Could not delete learning path")
    return false
  }
}

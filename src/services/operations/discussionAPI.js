import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { discussionEndpoints } from "../apis"

const { CREATE_DISCUSSION_API, GET_DISCUSSIONS_API, DELETE_DISCUSSION_API } = discussionEndpoints

export async function getDiscussions(subsectionId, token) {
  try {
    const response = await apiConnector(
      "GET",
      GET_DISCUSSIONS_API,
      null,
      { Authorization: `Bearer ${token}` },
      { subsectionId }
    )
    if (!response?.data?.success) throw new Error("Could not fetch discussion")
    return response.data.data
  } catch (error) {
    console.log("GET_DISCUSSIONS_API ERROR............", error)
    return []
  }
}

export async function postDiscussion(data, token) {
  try {
    const response = await apiConnector("POST", CREATE_DISCUSSION_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    return response.data.data
  } catch (error) {
    console.log("CREATE_DISCUSSION_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not post")
    return null
  }
}

export async function deleteDiscussion(discussionId, token) {
  try {
    const response = await apiConnector(
      "POST",
      DELETE_DISCUSSION_API,
      { discussionId },
      { Authorization: `Bearer ${token}` }
    )
    return !!response?.data?.success
  } catch (error) {
    console.log("DELETE_DISCUSSION_API ERROR............", error)
    toast.error("Could not delete")
    return false
  }
}

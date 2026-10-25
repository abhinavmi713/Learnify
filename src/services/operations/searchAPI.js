import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { courseEndpoints } from "../apis"

const { SEARCH_COURSES_API, SUGGEST_COURSES_API } = courseEndpoints

// Search-box autocomplete: up to 6 courses whose title starts with (or nearly
// matches) what was typed.
export const suggestCourses = async (q) => {
  try {
    const response = await apiConnector("GET", SUGGEST_COURSES_API, null, null, { q })
    return response?.data?.data || []
  } catch (error) {
    return []
  }
}

// Search & filter published courses.
// Pass { silent: true } to suppress the loading/error toast — used for
// live-as-you-type suggestions where a toast per keystroke would be noisy.
export const searchCourses = async (filters = {}, { silent = false } = {}) => {
  const toastId = silent ? null : toast.loading("Searching...")
  let result = { data: [], pagination: { total: 0, page: 1, pages: 0 } }
  try {
    const response = await apiConnector("POST", SEARCH_COURSES_API, filters)
    if (!response?.data?.success) {
      throw new Error("Could not fetch search results")
    }
    result = response.data
  } catch (error) {
    console.log("SEARCH_COURSES_API ERROR............", error)
    if (!silent) toast.error("Could not fetch search results")
  }
  if (toastId) toast.dismiss(toastId)
  return result
}

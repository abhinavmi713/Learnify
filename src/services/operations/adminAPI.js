import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { adminEndpoints } from "../apis"

const {
  GET_PENDING_COURSES_API,
  GET_ARCHIVED_COURSES_API,
  RESTORE_COURSE_API,
  APPROVE_COURSE_API,
  REJECT_COURSE_API,
  GET_ALL_USERS_ADMIN_API,
  SET_USER_ACTIVE_API,
  GET_PLATFORM_ANALYTICS_API,
  UPDATE_CATEGORY_API,
  DELETE_CATEGORY_API,
  CREATE_CATEGORY_API,
} = adminEndpoints

// List endpoints are paginated server-side; these return { items, pagination }
// so pages can render Previous/Next instead of silently showing only page 1.
const emptyPage = { items: [], pagination: null }

export async function getPendingCourses(token, page = 1) {
  try {
    const res = await apiConnector(
      "GET",
      GET_PENDING_COURSES_API,
      null,
      { Authorization: `Bearer ${token}` },
      { page }
    )
    return { items: res?.data?.data || [], pagination: res?.data?.pagination || null }
  } catch (error) {
    toast.error("Could not load pending courses")
    return emptyPage
  }
}

export async function getArchivedCourses(token, page = 1) {
  try {
    const res = await apiConnector(
      "GET",
      GET_ARCHIVED_COURSES_API,
      null,
      { Authorization: `Bearer ${token}` },
      { page }
    )
    return { items: res?.data?.data || [], pagination: res?.data?.pagination || null }
  } catch (error) {
    toast.error("Could not load archived courses")
    return emptyPage
  }
}

export async function restoreCourse(courseId, token) {
  try {
    const res = await apiConnector(
      "POST",
      RESTORE_COURSE_API,
      { courseId },
      { Authorization: `Bearer ${token}` }
    )
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Course restored")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not restore course")
    return false
  }
}

export async function approveCourse(courseId, token) {
  try {
    const res = await apiConnector(
      "POST",
      APPROVE_COURSE_API,
      { courseId },
      { Authorization: `Bearer ${token}` }
    )
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Course approved")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not approve course")
    return false
  }
}

export async function rejectCourse(courseId, reason, token) {
  try {
    const res = await apiConnector(
      "POST",
      REJECT_COURSE_API,
      { courseId, reason },
      { Authorization: `Bearer ${token}` }
    )
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Course rejected")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not reject course")
    return false
  }
}

export async function getAllUsersAdmin(token, { search = "", accountType = "", page = 1 } = {}) {
  try {
    const res = await apiConnector(
      "GET",
      GET_ALL_USERS_ADMIN_API,
      null,
      { Authorization: `Bearer ${token}` },
      { search, accountType: accountType || undefined, page }
    )
    return { items: res?.data?.data || [], pagination: res?.data?.pagination || null }
  } catch (error) {
    toast.error("Could not load users")
    return emptyPage
  }
}

export async function setUserActive(userId, active, token) {
  try {
    const res = await apiConnector(
      "POST",
      SET_USER_ACTIVE_API,
      { userId, active },
      { Authorization: `Bearer ${token}` }
    )
    if (!res.data.success) throw new Error(res.data.message)
    toast.success(res.data.message)
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not update user")
    return false
  }
}

export async function getPlatformAnalytics(token) {
  try {
    const res = await apiConnector("GET", GET_PLATFORM_ANALYTICS_API, null, {
      Authorization: `Bearer ${token}`,
    })
    return res?.data?.data || null
  } catch (error) {
    toast.error("Could not load platform analytics")
    return null
  }
}

export async function createCategory(data, token) {
  try {
    const res = await apiConnector("POST", CREATE_CATEGORY_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Category created")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not create category")
    return false
  }
}

export async function updateCategory(data, token) {
  try {
    const res = await apiConnector("POST", UPDATE_CATEGORY_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Category updated")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not update category")
    return false
  }
}

export async function deleteCategory(categoryId, token) {
  try {
    const res = await apiConnector(
      "POST",
      DELETE_CATEGORY_API,
      { categoryId },
      { Authorization: `Bearer ${token}` }
    )
    if (!res.data.success) throw new Error(res.data.message)
    toast.success("Category deleted")
    return true
  } catch (error) {
    toast.error(error?.response?.data?.message || "Could not delete category")
    return false
  }
}

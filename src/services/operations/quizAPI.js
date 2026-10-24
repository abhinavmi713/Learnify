import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { quizEndpoints } from "../apis"

const {
  CREATE_QUIZ_API,
  GET_QUIZZES_INSTRUCTOR_API,
  DELETE_QUIZ_API,
  GET_QUIZZES_STUDENT_API,
  SUBMIT_QUIZ_API,
  GENERATE_QUIZ_DRAFT_API,
} = quizEndpoints

export async function createQuiz(data, token) {
  try {
    const response = await apiConnector("POST", CREATE_QUIZ_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    toast.success("Quiz created")
    return response.data.data
  } catch (error) {
    console.log("CREATE_QUIZ_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not create quiz")
    return null
  }
}

export async function getInstructorQuizzes(courseId, token) {
  try {
    const response = await apiConnector("GET", GET_QUIZZES_INSTRUCTOR_API, null, {
      Authorization: `Bearer ${token}`,
    }, { courseId })
    if (!response?.data?.success) throw new Error("Could not fetch quizzes")
    return response.data.data
  } catch (error) {
    console.log("GET_QUIZZES_INSTRUCTOR_API ERROR............", error)
    return []
  }
}

export async function deleteQuiz(quizId, token) {
  try {
    const response = await apiConnector(
      "POST",
      DELETE_QUIZ_API,
      { quizId },
      { Authorization: `Bearer ${token}` }
    )
    toast.success("Quiz deleted")
    return !!response?.data?.success
  } catch (error) {
    console.log("DELETE_QUIZ_API ERROR............", error)
    toast.error("Could not delete quiz")
    return false
  }
}

export async function getStudentQuizzes(courseId, token) {
  try {
    const response = await apiConnector("GET", GET_QUIZZES_STUDENT_API, null, {
      Authorization: `Bearer ${token}`,
    }, { courseId })
    if (!response?.data?.success) throw new Error("Could not fetch quizzes")
    return response.data.data
  } catch (error) {
    console.log("GET_QUIZZES_STUDENT_API ERROR............", error)
    return []
  }
}

export async function generateQuizDraft(data, token) {
  try {
    const response = await apiConnector("POST", GENERATE_QUIZ_DRAFT_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    return response.data.data
  } catch (error) {
    console.log("GENERATE_QUIZ_DRAFT_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not generate quiz draft")
    return null
  }
}

export async function submitQuiz(data, token) {
  try {
    const response = await apiConnector("POST", SUBMIT_QUIZ_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message)
    return response.data
  } catch (error) {
    console.log("SUBMIT_QUIZ_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not submit quiz")
    return null
  }
}

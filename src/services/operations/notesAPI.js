import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { notesEndpoints } from "../apis"

const { CREATE_NOTE_API, GET_NOTES_API, DELETE_NOTE_API } = notesEndpoints

export async function getNotes(subsectionId, token) {
  try {
    const response = await apiConnector("GET", GET_NOTES_API, null, {
      Authorization: `Bearer ${token}`,
    }, { subsectionId })
    if (!response?.data?.success) throw new Error("Could not fetch notes")
    return response.data.data
  } catch (error) {
    console.log("GET_NOTES_API ERROR............", error)
    return []
  }
}

export async function createNote(data, token) {
  try {
    const response = await apiConnector("POST", CREATE_NOTE_API, data, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error(response?.data?.message || "Could not add note")
    return response.data.data
  } catch (error) {
    console.log("CREATE_NOTE_API ERROR............", error)
    toast.error(error?.response?.data?.message || "Could not add note")
    return null
  }
}

export async function deleteNote(noteId, token) {
  try {
    const response = await apiConnector(
      "POST",
      DELETE_NOTE_API,
      { noteId },
      { Authorization: `Bearer ${token}` }
    )
    return !!response?.data?.success
  } catch (error) {
    console.log("DELETE_NOTE_API ERROR............", error)
    toast.error("Could not delete note")
    return false
  }
}

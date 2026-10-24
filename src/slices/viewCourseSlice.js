import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  courseSectionData: [],
  courseEntireData: [],
  completedLectures: [],
  totalNoOfLectures: 0,
  // Array of { subsection, position, updatedAt } — last playback position per lecture.
  lastWatchedPositions: [],
}

const viewCourseSlice = createSlice({
  name: "viewCourse",
  initialState,
  reducers: {
    setCourseSectionData: (state, action) => {
      state.courseSectionData = action.payload
    },
    setEntireCourseData: (state, action) => {
      state.courseEntireData = action.payload
    },
    setTotalNoOfLectures: (state, action) => {
      state.totalNoOfLectures = action.payload
    },
    setCompletedLectures: (state, action) => {
      state.completedLectures = action.payload
    },
    updateCompletedLectures: (state, action) => {
      state.completedLectures = [...state.completedLectures, action.payload]
    },
    setLastWatchedPositions: (state, action) => {
      state.lastWatchedPositions = action.payload
    },
    updateLastWatchedPosition: (state, action) => {
      const { subsectionId, position } = action.payload
      const existing = state.lastWatchedPositions.find(
        (p) => p.subsection === subsectionId
      )
      if (existing) {
        existing.position = position
      } else {
        state.lastWatchedPositions.push({ subsection: subsectionId, position })
      }
    },
  },
})

export const {
  setCourseSectionData,
  setEntireCourseData,
  setTotalNoOfLectures,
  setCompletedLectures,
  updateCompletedLectures,
  setLastWatchedPositions,
  updateLastWatchedPosition,
} = viewCourseSlice.actions

export default viewCourseSlice.reducer

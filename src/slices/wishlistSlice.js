import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  // Array of course IDs (strings) currently in the student's wishlist.
  wishlistIds: [],
}

const wishlistSlice = createSlice({
  name: "wishlist",
  initialState,
  reducers: {
    setWishlistIds(state, action) {
      state.wishlistIds = action.payload
    },
    addWishlistId(state, action) {
      if (!state.wishlistIds.includes(action.payload)) {
        state.wishlistIds.push(action.payload)
      }
    },
    removeWishlistId(state, action) {
      state.wishlistIds = state.wishlistIds.filter((id) => id !== action.payload)
    },
    resetWishlist(state) {
      state.wishlistIds = []
    },
  },
})

export const { setWishlistIds, addWishlistId, removeWishlistId, resetWishlist } =
  wishlistSlice.actions

export default wishlistSlice.reducer

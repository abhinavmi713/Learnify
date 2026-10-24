import { toast } from "react-hot-toast"

import { setWishlistIds, addWishlistId, removeWishlistId } from "../../slices/wishlistSlice"
import { apiConnector } from "../apiConnector"
import { wishlistEndpoints } from "../apis"

const { GET_WISHLIST_API, ADD_TO_WISHLIST_API, REMOVE_FROM_WISHLIST_API } =
  wishlistEndpoints

// Fetches the full wishlist (populated course objects) — used on the Wishlist page.
export async function getWishlist(token) {
  try {
    const response = await apiConnector("GET", GET_WISHLIST_API, null, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error("Could not fetch wishlist")
    return response.data.data
  } catch (error) {
    console.log("GET_WISHLIST_API ERROR............", error)
    return []
  }
}

// Fetches just the IDs and syncs them into Redux — used once after login so
// heart icons across the app know what's already wishlisted.
export function loadWishlistIds(token) {
  return async (dispatch) => {
    const courses = await getWishlist(token)
    dispatch(setWishlistIds(courses.map((c) => c._id)))
  }
}

export function toggleWishlist(courseId, isWishlisted, token) {
  return async (dispatch) => {
    // Optimistic update — instant heart toggle, revert on failure.
    if (isWishlisted) {
      dispatch(removeWishlistId(courseId))
    } else {
      dispatch(addWishlistId(courseId))
    }
    try {
      const url = isWishlisted ? REMOVE_FROM_WISHLIST_API : ADD_TO_WISHLIST_API
      const response = await apiConnector(
        "POST",
        url,
        { courseId },
        { Authorization: `Bearer ${token}` }
      )
      if (!response?.data?.success) throw new Error("Wishlist update failed")
      toast.success(isWishlisted ? "Removed from wishlist" : "Added to wishlist")
    } catch (error) {
      console.log("WISHLIST TOGGLE ERROR............", error)
      // Revert the optimistic update
      if (isWishlisted) {
        dispatch(addWishlistId(courseId))
      } else {
        dispatch(removeWishlistId(courseId))
      }
      toast.error("Could not update wishlist")
    }
  }
}

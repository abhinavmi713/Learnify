import { createSlice } from "@reduxjs/toolkit"

const initialState = {
  cart: localStorage.getItem("cart")
    ? JSON.parse(localStorage.getItem("cart"))
    : [],
  total: localStorage.getItem("total")
    ? JSON.parse(localStorage.getItem("total"))
    : 0,
  totalItems: localStorage.getItem("totalItems")
    ? JSON.parse(localStorage.getItem("totalItems"))
    : 0,
  // Coupon applied to the current cart — { code, subtotal, discount, total } or null.
  // Intentionally NOT persisted to localStorage: it's revalidated against the
  // server on every checkout attempt anyway, so a stale client-side copy has no value.
  appliedCoupon: null,
}

// Reducers only compute state. Saving the cart and showing toasts happen in
// slices/cartEffects.js, so reducers stay pure (and replayable in dev tools).
const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (state, action) => {
      const course = action.payload
      const index = state.cart.findIndex((item) => item._id === course._id)

      if (index >= 0) {
        // If the course is already in the cart, do not modify the quantity
        return
      }
      // If the course is not in the cart, add it to the cart
      state.cart.push(course)
      // Update the total quantity and price
      state.totalItems++
      state.total += course.price
    },
    removeFromCart: (state, action) => {
      const courseId = action.payload
      const index = state.cart.findIndex((item) => item._id === courseId)

      if (index >= 0) {
        // If the course is found in the cart, remove it
        state.totalItems--
        state.total -= state.cart[index].price
        state.cart.splice(index, 1)
        // A coupon's discount was computed against the old cart contents — drop it
        // so the user re-applies (and re-validates) it against the new total.
        state.appliedCoupon = null
      }
    },
    // Silently drops the given courses (just bought, or already owned), keeping
    // everything else in the cart.
    removeCourses: (state, action) => {
      const ids = new Set((action.payload || []).map(String))
      const kept = state.cart.filter((item) => !ids.has(String(item._id)))
      if (kept.length === state.cart.length) return
      state.cart = kept
      state.totalItems = kept.length
      state.total = kept.reduce((sum, item) => sum + (item.price || 0), 0)
      state.appliedCoupon = null
    },
    // Brings stored copies up to date with the server (price changes).
    updateCartPrices: (state, action) => {
      const prices = action.payload || {}
      let changed = false
      for (const item of state.cart) {
        const price = prices[String(item._id)]
        if (typeof price === "number" && price !== item.price) {
          item.price = price
          changed = true
        }
      }
      if (!changed) return
      state.total = state.cart.reduce((sum, item) => sum + (item.price || 0), 0)
      state.appliedCoupon = null
    },
    resetCart: (state) => {
      state.cart = []
      state.total = 0
      state.totalItems = 0
      state.appliedCoupon = null
    },
    setAppliedCoupon: (state, action) => {
      state.appliedCoupon = action.payload
    },
    clearAppliedCoupon: (state) => {
      state.appliedCoupon = null
    },
  },
})

export const {
  addToCart,
  removeFromCart,
  removeCourses,
  updateCartPrices,
  resetCart,
  setAppliedCoupon,
  clearAppliedCoupon,
} = cartSlice.actions

export default cartSlice.reducer

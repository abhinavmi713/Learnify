import { createListenerMiddleware } from "@reduxjs/toolkit"
import { toast } from "react-hot-toast"

import { addToCart, removeFromCart } from "./cartSlice"

// Side effects of cart changes, kept out of the reducers.
export const cartEffects = createListenerMiddleware()

cartEffects.startListening({
  actionCreator: addToCart,
  effect: (action, api) => {
    const before = api.getOriginalState().cart.cart
    if (before.some((item) => item._id === action.payload?._id)) toast.error("Course already in cart")
    else toast.success("Course added to cart")
  },
})

cartEffects.startListening({
  actionCreator: removeFromCart,
  effect: (action, api) => {
    const before = api.getOriginalState().cart.cart
    if (before.some((item) => item._id === action.payload)) toast.success("Course removed from cart")
  },
})

// Saves the cart whenever it changes.
export function persistCart(store) {
  let last = store.getState().cart
  store.subscribe(() => {
    const { cart } = store.getState()
    if (cart === last) return
    last = cart
    try {
      if (cart.cart.length) {
        localStorage.setItem("cart", JSON.stringify(cart.cart))
        localStorage.setItem("total", JSON.stringify(cart.total))
        localStorage.setItem("totalItems", JSON.stringify(cart.totalItems))
      } else {
        localStorage.removeItem("cart")
        localStorage.removeItem("total")
        localStorage.removeItem("totalItems")
      }
    } catch (error) {
      // storage may be unavailable (private mode); the cart still works in memory
    }
  })
}

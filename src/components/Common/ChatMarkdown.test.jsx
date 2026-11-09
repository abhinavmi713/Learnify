import { render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"

import ChatMarkdown from "./ChatMarkdown"
import GetAvgRating from "../../utils/avgRating"
import cartReducer, { addToCart, updateCartPrices } from "../../slices/cartSlice"
import { cartEffects, persistCart } from "../../slices/cartEffects"

// U4: the assistant's Markdown is rendered, never injected as HTML.
test("renders bold, code, lists and fenced code as elements", () => {
  const { container } = render(
    <ChatMarkdown text={"Use **indexes** and `explain()`:\n\n- first\n- second\n\n```\nconst a = 1\n```"} />
  )
  expect(screen.getByText("indexes").tagName).toBe("STRONG")
  expect(screen.getByText("explain()").tagName).toBe("CODE")
  expect(container.querySelectorAll("li")).toHaveLength(2)
  expect(container.querySelector("pre code").textContent).toBe("const a = 1")
  expect(container.textContent).not.toContain("**")
})

test("HTML in a message stays text", () => {
  const { container } = render(<ChatMarkdown text={'<img src=x onerror="alert(1)"> **hi**'} />)
  expect(container.querySelector("img")).toBeNull()
  expect(container.textContent).toContain("<img")
})

// L25: review ids that aren't populated don't produce NaN.
test("average rating ignores unpopulated reviews", () => {
  expect(GetAvgRating(["64f1c2a1b2c3d4e5f6a7b8c9", "64f1c2a1b2c3d4e5f6a7b8d0"])).toBe(0)
  expect(GetAvgRating([{ rating: 4 }, { rating: 5 }, "64f1c2a1b2c3d4e5f6a7b8c9"])).toBe(4.5)
})

// U6: prices are refreshed from the server.
test("updateCartPrices changes prices and the total", () => {
  let state = cartReducer({ cart: [], total: 0, totalItems: 0, appliedCoupon: null }, addToCart({ _id: "c1", price: 500 }))
  state = cartReducer(state, updateCartPrices({ c1: 650 }))
  expect(state.cart[0].price).toBe(650)
  expect(state.total).toBe(650)
})

// L10: saving the cart happens outside the reducer.
test("the reducer has no side effects; the store saves the cart", () => {
  localStorage.clear()
  cartReducer({ cart: [], total: 0, totalItems: 0, appliedCoupon: null }, addToCart({ _id: "c2", price: 100 }))
  expect(localStorage.getItem("cart")).toBeNull()

  const store = configureStore({
    reducer: { cart: cartReducer },
    middleware: (getDefault) => getDefault().prepend(cartEffects.middleware),
  })
  persistCart(store)
  store.dispatch(addToCart({ _id: "c3", price: 200 }))
  expect(JSON.parse(localStorage.getItem("cart"))[0]._id).toBe("c3")
})

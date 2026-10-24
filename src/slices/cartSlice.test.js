import cartReducer, {
  addToCart,
  removeFromCart,
  resetCart,
  clearAppliedCoupon,
  setAppliedCoupon,
} from "./cartSlice"

const course = (overrides) => ({ _id: "course-1", price: 500, courseName: "Test Course", ...overrides })

const emptyState = { cart: [], total: 0, totalItems: 0, appliedCoupon: null }

beforeEach(() => {
  localStorage.clear()
})

test("addToCart adds a new course and updates the running total", () => {
  const state = cartReducer(emptyState, addToCart(course()))
  expect(state.cart).toHaveLength(1)
  expect(state.totalItems).toBe(1)
  expect(state.total).toBe(500)
})

test("addToCart does not add the same course twice or double-count its price", () => {
  const afterFirst = cartReducer(emptyState, addToCart(course()))
  const afterSecond = cartReducer(afterFirst, addToCart(course()))
  expect(afterSecond.cart).toHaveLength(1)
  expect(afterSecond.totalItems).toBe(1)
  expect(afterSecond.total).toBe(500)
})

test("removeFromCart removes the course, updates the total, and clears any applied coupon", () => {
  const withItem = cartReducer(emptyState, addToCart(course()))
  const withCoupon = { ...withItem, appliedCoupon: { code: "SAVE10", total: 450 } }
  const afterRemove = cartReducer(withCoupon, removeFromCart("course-1"))

  expect(afterRemove.cart).toHaveLength(0)
  expect(afterRemove.total).toBe(0)
  expect(afterRemove.totalItems).toBe(0)
  // Stale — it was computed against a cart that no longer exists.
  expect(afterRemove.appliedCoupon).toBeNull()
})

test("resetCart clears the cart, totals, and any applied coupon", () => {
  const withItems = cartReducer(emptyState, addToCart(course()))
  const state = cartReducer(withItems, resetCart())
  expect(state).toEqual(emptyState)
})

test("setAppliedCoupon / clearAppliedCoupon track the coupon independently of cart contents", () => {
  const withCoupon = cartReducer(emptyState, setAppliedCoupon({ code: "SAVE10", total: 450 }))
  expect(withCoupon.appliedCoupon).toEqual({ code: "SAVE10", total: 450 })

  const cleared = cartReducer(withCoupon, clearAppliedCoupon())
  expect(cleared.appliedCoupon).toBeNull()
})

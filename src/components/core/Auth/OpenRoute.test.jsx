import { configureStore } from "@reduxjs/toolkit"
import { render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import OpenRoute from "./OpenRoute"

// OpenRoute only ever reads `state.auth.token` — a bare reducer returning
// that shape is enough to exercise the redirect logic in isolation.
function renderWithToken(token) {
  const store = configureStore({
    reducer: { auth: () => ({ token }) },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <OpenRoute>
                <div>Login Form</div>
              </OpenRoute>
            }
          />
          <Route path="/dashboard/my-profile" element={<div>My Profile</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

test("renders the login form for a logged-out visitor", () => {
  renderWithToken(null)
  expect(screen.getByText("Login Form")).toBeInTheDocument()
})

test("redirects an already-logged-in user away from /login", () => {
  renderWithToken("a-real-token")
  expect(screen.getByText("My Profile")).toBeInTheDocument()
  expect(screen.queryByText("Login Form")).not.toBeInTheDocument()
})

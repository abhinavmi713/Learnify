import { configureStore } from "@reduxjs/toolkit"
import { render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import PrivateRoute from "./PrivateRoute"

// PrivateRoute only ever reads `state.auth.token`, so a full auth slice
// (signup/OTP/etc.) isn't needed — a bare reducer returning that shape is
// enough to exercise the redirect logic in isolation.
function renderWithToken(token) {
  const store = configureStore({
    reducer: { auth: () => ({ token }) },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/dashboard/my-profile"]}>
        <Routes>
          <Route
            path="/dashboard/my-profile"
            element={
              <PrivateRoute>
                <div>Protected Content</div>
              </PrivateRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

test("renders the protected content when a token is present", () => {
  renderWithToken("a-real-token")
  expect(screen.getByText("Protected Content")).toBeInTheDocument()
})

test("redirects to /login when there is no token", () => {
  renderWithToken(null)
  expect(screen.getByText("Login Page")).toBeInTheDocument()
  expect(screen.queryByText("Protected Content")).not.toBeInTheDocument()
})

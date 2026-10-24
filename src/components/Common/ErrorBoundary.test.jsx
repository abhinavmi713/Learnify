import { render, screen } from "@testing-library/react"

import ErrorBoundary from "./ErrorBoundary"

function Bomb({ explode }) {
  if (explode) throw new Error("boom")
  return <div>All good</div>
}

// React logs caught render errors to the console; keep the test output readable.
beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}))
afterEach(() => console.error.mockRestore())

test("renders children normally when nothing throws", () => {
  render(
    <ErrorBoundary resetKey="/a">
      <Bomb explode={false} />
    </ErrorBoundary>
  )
  expect(screen.getByText("All good")).toBeInTheDocument()
})

test("shows a recovery screen instead of a blank page when a child throws", () => {
  render(
    <ErrorBoundary resetKey="/a">
      <Bomb explode />
    </ErrorBoundary>
  )
  expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong")
  expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument()
})

test("recovers when the route changes (resetKey)", () => {
  const { rerender } = render(
    <ErrorBoundary resetKey="/a">
      <Bomb explode />
    </ErrorBoundary>
  )
  expect(screen.getByRole("alert")).toBeInTheDocument()

  rerender(
    <ErrorBoundary resetKey="/b">
      <Bomb explode={false} />
    </ErrorBoundary>
  )
  expect(screen.getByText("All good")).toBeInTheDocument()
})

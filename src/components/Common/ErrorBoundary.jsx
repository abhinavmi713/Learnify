import { Component } from "react"

// Without this, one unexpected render error anywhere (a field the API didn't
// send, a bad data shape) unmounts the whole React tree and leaves a blank
// white page with no way out. This catches it, shows a recovery screen, and
// resets itself when `resetKey` changes (we pass the current route, so
// navigating elsewhere gives the user a working page again).
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Surfaces in the browser console (and in any error tracker attached to it).
    console.error("Unhandled UI error:", error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[60vh] w-11/12 max-w-md flex-col items-center justify-center gap-4 text-center"
      >
        <h1 className="text-2xl font-semibold text-richblack-5">Something went wrong</h1>
        <p className="text-richblack-300">
          This page hit an unexpected problem. Reloading usually fixes it — if it keeps
          happening, please contact support.
        </p>
        <div className="flex gap-3">
          <button className="yellowButton" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a
            href="/"
            className="rounded-lg border border-richblack-600 px-4 py-2 text-richblack-100 hover:border-richblack-400"
          >
            Go home
          </a>
        </div>
      </div>
    )
  }
}

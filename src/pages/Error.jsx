import { Link } from "react-router-dom"

function Error() {
  return (
    <div className="hero-glow flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-md text-center">
        <p className="font-display text-8xl font-extrabold text-yellow-50">404</p>
        <h1 className="mt-4 text-3xl font-bold text-richblack-5">We can&apos;t find that page</h1>
        <p className="mt-3 text-richblack-300">
          The link may be broken, or the page may have moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="yellowButton">
            Go home
          </Link>
          <Link to="/search" className="blackButton">
            Browse courses
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Error

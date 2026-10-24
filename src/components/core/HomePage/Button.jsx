import { Link } from "react-router-dom"

const Button = ({ children, active, linkto }) => {
  return (
    <Link to={linkto}>
      <div
        className={`rounded-full px-7 py-3 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:text-base ${
          active
            ? "bg-yellow-50 text-richblack-900 hover:bg-yellow-100"
            : "border border-richblack-600 bg-richblack-800 text-richblack-5 hover:border-yellow-50"
        }`}
      >
        {children}
      </div>
    </Link>
  )
}

export default Button

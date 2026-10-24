import { Link } from "react-router-dom"

// Shared "nothing here yet" block: an icon, a short explanation and one clear
// next step, instead of a bare line of text.
export default function EmptyState({ icon: Icon, title, text, actionLabel, actionTo }) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-yellow-50/15 text-yellow-50">
          <Icon size={26} />
        </span>
      )}
      <h2 className="font-display text-xl font-bold text-richblack-5">{title}</h2>
      {text && <p className="mt-2 max-w-md text-sm text-richblack-300">{text}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="yellowButton mt-6">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

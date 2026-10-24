// Prev / Next control for the paginated admin lists. Renders nothing when
// there's only one page, so short lists look exactly as they did before.
export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.pages <= 1) return null
  const { page, pages, total } = pagination

  const buttonClass =
    "rounded-lg border border-richblack-600 px-3 py-1.5 text-sm text-richblack-100 transition-colors hover:border-richblack-400 disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-richblack-300">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button className={buttonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button className={buttonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  )
}

import { Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import useDebouncedValue from "../../hooks/useDebouncedValue"
import { searchCourses } from "../../services/operations/searchAPI"

// Search input with a live-suggestions dropdown. Submitting (Enter) or
// clicking a suggestion navigates to the full search results page.
export default function SearchBar({ onNavigate, autoFocus = false }) {
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 300)
  const navigate = useNavigate()
  const containerRef = useRef(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([])
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await searchCourses(
        { search: debouncedQuery.trim(), limit: 5 },
        { silent: true }
      )
      if (!cancelled) setSuggestions(result.data || [])
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const goToResults = (q) => {
    if (!q.trim()) return
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    setOpen(false)
    onNavigate?.()
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2">
        <Search size={16} className="shrink-0 text-richblack-400" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToResults(query)
          }}
          placeholder="Search courses..."
          className="w-0 flex-1 bg-transparent text-sm text-richblack-5 placeholder:text-richblack-400 focus:outline-none"
        />
        {query && (
          <button
            aria-label="Clear search"
            onClick={() => {
              setQuery("")
              setSuggestions([])
            }}
            className="text-richblack-400 hover:text-richblack-100"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (suggestions.length > 0 || debouncedQuery.trim()) && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[90] max-h-96 overflow-y-auto rounded-xl border border-richblack-700 bg-richblack-800 p-2 shadow-xl shadow-black/40">
          {suggestions.length > 0 ? (
            <>
              {suggestions.map((course) => (
                <button
                  key={course._id}
                  onClick={() => {
                    navigate(`/courses/${course._id}`)
                    setOpen(false)
                    onNavigate?.()
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-richblack-700"
                >
                  <img
                    src={course.thumbnail}
                    alt=""
                    className="h-10 w-14 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-richblack-5">{course.courseName}</p>
                    <p className="text-xs text-richblack-400">₹{course.price}</p>
                  </div>
                </button>
              ))}
              <button
                onClick={() => goToResults(query)}
                className="mt-1 w-full rounded-lg p-2 text-center text-sm text-richblue-200 hover:bg-richblack-700"
              >
                See all results for "{debouncedQuery}"
              </button>
            </>
          ) : (
            <p className="p-3 text-center text-sm text-richblack-400">
              No courses found for "{debouncedQuery}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}

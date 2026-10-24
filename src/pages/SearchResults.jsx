import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import Footer from "../components/Common/Footer"
import CourseCard from "../components/core/Catalog/Course_Card"
import { apiConnector } from "../services/apiConnector"
import { categories } from "../services/apis"
import { searchCourses } from "../services/operations/searchAPI"

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "priceLowHigh", label: "Price: Low to High" },
  { value: "priceHighLow", label: "Price: High to Low" },
  { value: "ratingHighLow", label: "Highest Rated" },
]

const RATING_OPTIONS = [4, 3, 2, 1]

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("q") || ""

  const [allCategories, setAllCategories] = useState([])
  const [category, setCategory] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [minRating, setMinRating] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [page, setPage] = useState(1)

  const [results, setResults] = useState([])
  const [pagination, setPagination] = useState({ total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiConnector("GET", categories.CATEGORIES_API)
        setAllCategories(res?.data?.data || [])
      } catch (error) {
        console.log("Could not fetch categories", error)
      }
    })()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [query, category, minPrice, maxPrice, minRating, sortBy])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const filters = {
        search: query,
        sortBy,
        page,
        limit: 12,
      }
      if (category) filters.category = category
      if (minPrice !== "") filters.minPrice = Number(minPrice)
      if (maxPrice !== "") filters.maxPrice = Number(maxPrice)
      if (minRating !== "") filters.minRating = Number(minRating)

      const res = await searchCourses(filters, { silent: true })
      setResults(res.data || [])
      setPagination(res.pagination || { total: 0, pages: 0 })
      setLoading(false)
    })()
  }, [query, category, minPrice, maxPrice, minRating, sortBy, page])

  const clearFilters = () => {
    setCategory("")
    setMinPrice("")
    setMaxPrice("")
    setMinRating("")
    setSortBy("newest")
  }

  return (
    <>
      <div className="mx-auto w-11/12 max-w-maxContent py-10">
        <h1 className="mb-1 text-2xl font-bold text-richblack-5">
          {query ? `Results for "${query}"` : "Browse all courses"}
        </h1>
        <p className="mb-8 text-richblack-400">
          {loading ? "Searching..." : `${pagination.total} course${pagination.total === 1 ? "" : "s"} found`}
        </p>

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Filters sidebar */}
          <aside className="flex w-full flex-col gap-6 lg:w-64 lg:shrink-0">
            <div>
              <label className="mb-2 block text-sm font-medium text-richblack-200">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => setSearchParams({ q: e.target.value })}
                placeholder="Search courses..."
                className="w-full rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-richblack-200">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 focus:border-richblue-300 focus:outline-none"
              >
                <option value="">All Categories</option>
                {allCategories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-richblack-200">
                Price Range (₹)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Min"
                  className="w-0 flex-1 rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
                />
                <span className="text-richblack-400">–</span>
                <input
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Max"
                  className="w-0 flex-1 rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 placeholder:text-richblack-400 focus:border-richblue-300 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-richblack-200">
                Minimum Rating
              </label>
              <div className="flex flex-wrap gap-2">
                {RATING_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setMinRating(minRating === String(r) ? "" : String(r))}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      minRating === String(r)
                        ? "border-yellow-50 bg-yellow-50 text-richblack-900"
                        : "border-richblack-600 text-richblack-200 hover:border-richblack-400"
                    }`}
                  >
                    {r}+ ★
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-richblack-200">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-lg border border-richblack-600 bg-richblack-800 px-3 py-2 text-sm text-richblack-5 focus:border-richblue-300 focus:outline-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="text-left text-sm text-richblue-200 hover:underline"
            >
              Clear filters
            </button>
          </aside>

          {/* Results */}
          <div className="flex-1">
            {loading ? (
              <div className="grid place-items-center py-20">
                <div className="spinner"></div>
              </div>
            ) : results.length === 0 ? (
              <p className="py-20 text-center text-lg text-richblack-300">
                No courses match your filters.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((course) => (
                    <CourseCard course={course} key={course._id} Height="h-[180px]" />
                  ))}
                </div>

                {pagination.pages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-richblack-600 px-3 py-2 text-sm text-richblack-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="px-2 text-sm text-richblack-300">
                      Page {page} of {pagination.pages}
                    </span>
                    <button
                      disabled={page >= pagination.pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-richblack-600 px-3 py-2 text-sm text-richblack-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

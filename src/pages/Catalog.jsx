import React, { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router-dom"

// import CourseCard from "../components/Catalog/CourseCard"
// import CourseSlider from "../components/Catalog/CourseSlider"
import Footer from "../components/Common/Footer"
import CourseCard from "../components/core/Catalog/Course_Card"
import CourseSlider from "../components/core/Catalog/Course_Slider"
import { apiConnector } from "../services/apiConnector"
import { categories } from "../services/apis"
import { getCatalogPageData } from "../services/operations/pageAndComponntDatas"
import Error from "./Error"

function Catalog() {
  const { loading } = useSelector((state) => state.profile)
  const { catalogName } = useParams()
  const [active, setActive] = useState(1)
  const [catalogPageData, setCatalogPageData] = useState(null)
  const [categoryId, setCategoryId] = useState("")
  // Fetch All Categories
  useEffect(() => {
    ;(async () => {
      try {
        const res = await apiConnector("GET", categories.CATEGORIES_API)
        const category_id = res?.data?.data?.filter(
          (ct) => ct.name.split(" ").join("-").toLowerCase() === catalogName
        )[0]._id
        setCategoryId(category_id)
      } catch (error) {
        console.log("Could not fetch Categories.", error)
      }
    })()
  }, [catalogName])
  useEffect(() => {
    if (categoryId) {
      ;(async () => {
        try {
          const res = await getCatalogPageData(categoryId)
          setCatalogPageData(res)
        } catch (error) {
          console.log(error)
        }
      })()
    }
  }, [categoryId])

  if (loading || !catalogPageData) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <div className="spinner"></div>
      </div>
    )
  }
  if (!loading && !catalogPageData.success) {
    return <Error />
  }

  const selected = catalogPageData?.data?.selectedCategory
  const sorted = [...(selected?.courses || [])].sort((x, y) =>
    active === 1
      ? (y.studentsEnrolled?.length || y.studentsEnroled?.length || 0) -
        (x.studentsEnrolled?.length || x.studentsEnroled?.length || 0)
      : new Date(y.createdAt || 0) - new Date(x.createdAt || 0)
  )

  return (
    <>
      {/* Hero */}
      <div className="hero-glow">
        <div className="mx-auto flex min-h-[240px] w-11/12 max-w-maxContent flex-col justify-center gap-3 py-12">
          <p className="text-sm text-richblack-300">
            Home / Catalog / <span className="font-semibold text-yellow-50">{selected?.name}</span>
          </p>
          <h1 className="text-4xl font-extrabold text-richblack-5 sm:text-5xl">{selected?.name}</h1>
          <p className="max-w-2xl text-richblack-200">{selected?.description}</p>
        </div>
      </div>

      {/* Courses in this category */}
      <div className="mx-auto w-11/12 max-w-maxContent py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="section_heading">Courses to get you started</h2>
          <div className="flex gap-1 rounded-full border border-richblack-600 bg-richblack-800 p-1 text-sm font-medium">
            {[
              [1, "Most popular"],
              [2, "Newest"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`rounded-full px-4 py-1.5 transition-colors ${
                  active === id
                    ? "bg-yellow-50 text-richblack-900"
                    : "text-richblack-200 hover:text-richblack-5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {sorted.length ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((course) => (
              <CourseCard course={course} key={course._id} Height="h-[170px]" />
            ))}
          </div>
        ) : (
          <p className="text-richblack-300">No courses in this category yet.</p>
        )}
      </div>

      {/* Another category */}
      {catalogPageData?.data?.differentCategory?.courses?.length > 0 && (
        <div className="mx-auto w-11/12 max-w-maxContent py-10">
          <h2 className="section_heading mb-6">
            Top courses in {catalogPageData.data.differentCategory.name}
          </h2>
          <CourseSlider Courses={catalogPageData.data.differentCategory.courses} />
        </div>
      )}

      {/* Best sellers */}
      {catalogPageData?.data?.mostSellingCourses?.length > 0 && (
        <div className="mx-auto w-11/12 max-w-maxContent py-10">
          <h2 className="section_heading mb-6">Frequently bought</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {catalogPageData.data.mostSellingCourses.slice(0, 4).map((course) => (
              <CourseCard course={course} key={course._id} Height="h-[170px]" />
            ))}
          </div>
        </div>
      )}

      <Footer />
    </>
  )
}

export default Catalog

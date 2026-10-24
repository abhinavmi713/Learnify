import React, { useEffect, useState } from "react"
import { BiInfoCircle } from "react-icons/bi"
import { HiOutlineGlobeAlt } from "react-icons/hi"
import { ReactMarkdown } from "react-markdown/lib/react-markdown"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate, useParams } from "react-router-dom"

import ConfirmationModal from "../components/Common/ConfirmationModal"
import Footer from "../components/Common/Footer"
import RatingStars from "../components/Common/RatingStars"
import CourseAccordionBar from "../components/core/Course/CourseAccordionBar"
import CourseDetailsCard from "../components/core/Course/CourseDetailsCard"
import { formatDate } from "../services/formatDate"
import { fetchCourseDetails } from "../services/operations/courseDetailsAPI"
import { BuyCourse } from "../services/operations/studentFeaturesAPI"
import { addToCart } from "../slices/cartSlice"
import { ACCOUNT_TYPE } from "../utils/constants"
import GetAvgRating from "../utils/avgRating"
import Error from "./Error"

function CourseDetails() {
  const { user } = useSelector((state) => state.profile)
  const { token } = useSelector((state) => state.auth)
  const { loading } = useSelector((state) => state.profile)
  const { paymentLoading } = useSelector((state) => state.course)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  // Getting courseId from url parameter
  const { courseId } = useParams()
  // console.log(`course id: ${courseId}`)

  // Declear a state to save the course details
  const [response, setResponse] = useState(null)
  const [confirmationModal, setConfirmationModal] = useState(null)
  useEffect(() => {
    // Calling fetchCourseDetails fucntion to fetch the details
    ;(async () => {
      try {
        const res = await fetchCourseDetails(courseId)
        // console.log("course details res: ", res)
        setResponse(res)
      } catch (error) {
        console.log("Could not fetch Course Details")
      }
    })()
  }, [courseId])

  // console.log("response: ", response)

  // Calculating Avg Review count
  const [avgReviewCount, setAvgReviewCount] = useState(0)
  useEffect(() => {
    const count = GetAvgRating(response?.data?.courseDetails.ratingAndReviews)
    setAvgReviewCount(count)
  }, [response])
  // console.log("avgReviewCount: ", avgReviewCount)

  // // Collapse all
  // const [collapse, setCollapse] = useState("")
  const [isActive, setIsActive] = useState(Array(0))
  const handleActive = (id) => {
    // console.log("called", id)
    setIsActive(
      !isActive.includes(id)
        ? isActive.concat([id])
        : isActive.filter((e) => e !== id)
    )
  }

  // Total number of lectures
  const [totalNoOfLectures, setTotalNoOfLectures] = useState(0)
  useEffect(() => {
    let lectures = 0
    response?.data?.courseDetails?.courseContent?.forEach((sec) => {
      lectures += sec.subSection.length || 0
    })
    setTotalNoOfLectures(lectures)
  }, [response])

  if (loading || !response) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <div className="spinner"></div>
      </div>
    )
  }
  if (!response.success) {
    return <Error />
  }

  const {
    courseName,
    courseDescription,
    price,
    whatYouWillLearn,
    courseContent,
    ratingAndReviews,
    instructor,
    studentsEnroled,
    createdAt,
  } = response.data?.courseDetails

  const handleBuyCourse = () => {
    if (token) {
      BuyCourse(token, [courseId], user, navigate, dispatch)
      return
    }
    setConfirmationModal({
      text1: "You are not logged in!",
      text2: "Please login to Purchase Course.",
      btn1Text: "Login",
      btn2Text: "Cancel",
      btn1Handler: () => navigate("/login"),
      btn2Handler: () => setConfirmationModal(null),
    })
  }

  const handleAddToCart = () => {
    if (user && user?.accountType === ACCOUNT_TYPE.INSTRUCTOR) {
      return
    }
    if (token) {
      dispatch(addToCart(response.data.courseDetails))
      return
    }
    setConfirmationModal({
      text1: "You are not logged in!",
      text2: "Please login to add To Cart",
      btn1Text: "Login",
      btn2Text: "Cancel",
      btn1Handler: () => navigate("/login"),
      btn2Handler: () => setConfirmationModal(null),
    })
  }

  if (paymentLoading) {
    // console.log("payment loading")
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <>
      <div className="hero-glow">
        <div className="mx-auto grid w-11/12 max-w-maxContent items-start gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Main column */}
          <div className="min-w-0">
            <p className="text-sm text-richblack-300">
              Home / Courses / <span className="font-semibold text-yellow-50">{courseName}</span>
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight text-richblack-5 sm:text-5xl">
              {courseName}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-richblack-200">{courseDescription}</p>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-richblack-200">
              <span className="flex items-center gap-2">
                <span className="font-bold text-richblack-5">{avgReviewCount}</span>
                <RatingStars Review_Count={avgReviewCount} Star_Size={18} />
                <span>{`(${ratingAndReviews.length} ${ratingAndReviews.length === 1 ? "review" : "reviews"})`}</span>
              </span>
              <span>{`${studentsEnroled.length} ${studentsEnroled.length === 1 ? "student" : "students"} enrolled`}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-richblack-200">
              <span>
                Created by{" "}
                <span className="font-semibold text-richblack-5">{`${instructor.firstName} ${instructor.lastName}`}</span>
              </span>
              <span className="flex items-center gap-2">
                <BiInfoCircle /> Created {formatDate(createdAt)}
              </span>
              <span className="flex items-center gap-2">
                <HiOutlineGlobeAlt /> English
              </span>
            </div>

            {/* Buy bar (small screens; the card replaces it on large screens) */}
            <div className="surface mt-6 flex flex-col gap-3 p-5 lg:hidden">
              <p className="text-3xl font-bold text-richblack-5">
                {price ? `₹${price}` : "Free"}
              </p>
              {user && studentsEnroled.some((id) => String(id?._id || id) === String(user._id)) ? (
                <button className="yellowButton" onClick={() => navigate("/dashboard/enrolled-courses")}>
                  Go To Course
                </button>
              ) : (
                <>
                  <button className="yellowButton" onClick={handleBuyCourse}>
                    {price > 0 ? "Buy Now" : "Enroll for free"}
                  </button>
                  <button className="blackButton" onClick={handleAddToCart}>
                    Add to Cart
                  </button>
                </>
              )}
            </div>

            {/* What you will learn */}
            <div className="surface mt-10 p-7">
              <h2 className="font-display text-2xl font-bold">What you&apos;ll learn</h2>
              <div className="mt-4 text-richblack-200 [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{whatYouWillLearn}</ReactMarkdown>
              </div>
            </div>

            {/* Course content */}
            <div className="mt-10">
              <h2 className="font-display text-2xl font-bold">Course content</h2>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-richblack-300">
                <div className="flex flex-wrap gap-x-3">
                  <span>{courseContent.length} section(s)</span>
                  <span>{totalNoOfLectures} lecture(s)</span>
                  <span>{response.data?.totalDuration} total length</span>
                </div>
                <button className="font-semibold text-yellow-50" onClick={() => setIsActive([])}>
                  Collapse all sections
                </button>
              </div>
              <div className="py-4">
                {courseContent?.map((course, index) => (
                  <CourseAccordionBar
                    course={course}
                    key={index}
                    isActive={isActive}
                    handleActive={handleActive}
                  />
                ))}
              </div>
            </div>

            {/* Author */}
            <div className="mb-12 mt-6">
              <h2 className="font-display text-2xl font-bold">Your instructor</h2>
              <div className="flex items-center gap-4 py-4">
                <img
                  src={
                    instructor.image
                      ? instructor.image
                      : `https://api.dicebear.com/5.x/initials/svg?seed=${instructor.firstName} ${instructor.lastName}`
                  }
                  alt="Author"
                  className="h-14 w-14 rounded-full object-cover"
                />
                <p className="text-lg font-semibold">{`${instructor.firstName} ${instructor.lastName}`}</p>
              </div>
              <p className="text-richblack-200">{instructor?.additionalDetails?.about}</p>
            </div>
          </div>

          {/* Sticky purchase card */}
          <div className="hidden lg:sticky lg:top-24 lg:block">
            <CourseDetailsCard
              course={response?.data?.courseDetails}
              setConfirmationModal={setConfirmationModal}
              handleBuyCourse={handleBuyCourse}
            />
          </div>
        </div>
      </div>
      <Footer />
      {confirmationModal && <ConfirmationModal modalData={confirmationModal} />}
    </>
  )
}

export default CourseDetails

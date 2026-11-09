import { lazy, Suspense, useEffect, useState } from "react"
import "./App.css"
// Redux
import { useDispatch, useSelector } from "react-redux"
// React Router
import { Route, Routes, useLocation, useNavigate } from "react-router-dom"

// Components
import Navbar from "./components/Common/Navbar"
import OpenRoute from "./components/core/Auth/OpenRoute"
import PrivateRoute from "./components/core/Auth/PrivateRoute"
import ChatBot from "./components/Common/ChatBot"
// Pages
import Home from "./pages/Home"
import { loadWishlistIds } from "./services/operations/wishlistAPI"
import { ACCOUNT_TYPE } from "./utils/constants"
import { titleFor } from "./utils/pageTitle"

import ErrorBoundary from "./components/Common/ErrorBoundary"
import { getUserDetails } from "./services/operations/profileAPI"

// Pages load on demand (code splitting).
const AddCourse = lazy(() => import("./components/core/Dashboard/AddCourse"))
const Cart = lazy(() => import("./components/core/Dashboard/Cart"))
const EditCourse = lazy(() => import("./components/core/Dashboard/EditCourse"))
const EnrolledCourses = lazy(() => import("./components/core/Dashboard/EnrolledCourses"))
const Instructor = lazy(() => import("./components/core/Dashboard/Instructor"))
const MyCourses = lazy(() => import("./components/core/Dashboard/MyCourses"))
const Webhooks = lazy(() => import("./components/core/Dashboard/Webhooks"))
const MyProfile = lazy(() => import("./components/core/Dashboard/MyProfile"))
const LiveClass = lazy(() => import("./components/core/Dashboard/LiveClass"))
const Settings = lazy(() => import("./components/core/Dashboard/Settings"))
const Wishlist = lazy(() => import("./components/core/Dashboard/Wishlist"))
const Certificates = lazy(() => import("./components/core/Dashboard/Certificates"))
const Achievements = lazy(() => import("./components/core/Dashboard/Achievements"))
const StudentLiveClasses = lazy(() => import("./components/core/Dashboard/StudentLiveClasses"))
const ManageQuizzes = lazy(() => import("./components/core/Dashboard/ManageQuizzes"))
const ManageCoupons = lazy(() => import("./components/core/Dashboard/Admin/ManageCoupons"))
const AuditLog = lazy(() => import("./components/core/Dashboard/Admin/AuditLog"))
const ModerateCourses = lazy(() => import("./components/core/Dashboard/Admin/ModerateCourses"))
const ManageUsers = lazy(() => import("./components/core/Dashboard/Admin/ManageUsers"))
const ManageCategories = lazy(() => import("./components/core/Dashboard/Admin/ManageCategories"))
const ManageLearningPaths = lazy(() => import("./components/core/Dashboard/Admin/ManageLearningPaths"))
const PlatformAnalytics = lazy(() => import("./components/core/Dashboard/Admin/PlatformAnalytics"))
const VideoDetails = lazy(() => import("./components/core/ViewCourse/VideoDetails"))
const CourseQuizzes = lazy(() => import("./components/core/ViewCourse/CourseQuizzes"))
const TakeQuiz = lazy(() => import("./components/core/ViewCourse/TakeQuiz"))
const About = lazy(() => import("./pages/About"))
const Catalog = lazy(() => import("./pages/Catalog"))
const Contact = lazy(() => import("./pages/Contact"))
const CourseDetails = lazy(() => import("./pages/CourseDetails"))
const Dashboard = lazy(() => import("./pages/Dashboard"))
const Error = lazy(() => import("./pages/Error"))
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"))
const SearchResults = lazy(() => import("./pages/SearchResults"))
const VerifyCertificate = lazy(() => import("./pages/VerifyCertificate"))
const LearningPaths = lazy(() => import("./pages/LearningPaths"))
const LearningPathDetails = lazy(() => import("./pages/LearningPathDetails"))
const LegalPage = lazy(() => import("./pages/LegalPage"))
const Login = lazy(() => import("./pages/Login"))
const Signup = lazy(() => import("./pages/Signup"))
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"))
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"))
const ViewCourse = lazy(() => import("./pages/ViewCourse"))


function App() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useSelector((state) => state.profile)
  // Starts true only when there's no token to check — otherwise the role-gated
  // dashboard routes below wouldn't exist yet on first render, and a hard
  // refresh/direct navigation to e.g. /dashboard/cart would 404 before `user`
  // has a chance to load.
  const [authChecked, setAuthChecked] = useState(!localStorage.getItem("token"))

  useEffect(() => {
    document.title = titleFor(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    const storedToken = localStorage.getItem("token")
    if (storedToken) {
      const token = JSON.parse(storedToken)
      Promise.all([
        dispatch(getUserDetails(token, navigate)),
        dispatch(loadWishlistIds(token)),
      ]).finally(() => setAuthChecked(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!authChecked) {
    return (
      <div className="grid min-h-screen w-screen place-items-center bg-richblack-900">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-screen flex-col bg-richblack-900 font-sans">
      <Navbar />
      <ErrorBoundary resetKey={location.pathname}>
      {/* Pages load on demand, so the first visit doesn't download every page. */}
      <Suspense
        fallback={
          <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center">
            <div className="spinner"></div>
          </div>
        }
      >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="courses/:courseId" element={<CourseDetails />} />
        <Route path="catalog/:catalogName" element={<Catalog />} />
        <Route path="search" element={<SearchResults />} />
        <Route path="verify-certificate/:certificateId" element={<VerifyCertificate />} />
        <Route path="learning-paths" element={<LearningPaths />} />
        <Route path="learning-paths/:pathId" element={<LearningPathDetails />} />
        <Route path="terms" element={<LegalPage docKey="terms" />} />
        <Route path="privacy-policy" element={<LegalPage docKey="privacy" />} />
        <Route path="refund-policy" element={<LegalPage docKey="refund" />} />
        <Route path="cookie-policy" element={<LegalPage docKey="cookies" />} />

        {/* Open Route - for Only Non Logged in User */}
        <Route
          path="login"
          element={
            <OpenRoute>
              <Login />
            </OpenRoute>
          }
        />
        <Route
          path="forgot-password"
          element={
            <OpenRoute>
              <ForgotPassword />
            </OpenRoute>
          }
        />
        <Route
          path="update-password/:id"
          element={
            <OpenRoute>
              <UpdatePassword />
            </OpenRoute>
          }
        />
        <Route
          path="signup"
          element={
            <OpenRoute>
              <Signup />
            </OpenRoute>
          }
        />
        <Route
          path="verify-email"
          element={
            <OpenRoute>
              <VerifyEmail />
            </OpenRoute>
          }
        />

        {/* Private Route - for Only Logged in User */}
        <Route
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        >
          {/* Route for all users */}
          <Route path="dashboard/my-profile" element={<MyProfile />} />
          <Route path="dashboard/Settings" element={<Settings />} />

          {/* Route only for Instructors */}
          {user?.accountType === ACCOUNT_TYPE.INSTRUCTOR && (
            <>
              <Route path="dashboard/instructor" element={<Instructor />} />
              <Route path="dashboard/my-courses" element={<MyCourses />} />
              <Route path="dashboard/webhooks" element={<Webhooks />} />
              <Route path="dashboard/add-course" element={<AddCourse />} />
              <Route
                path="dashboard/edit-course/:courseId"
                element={<EditCourse />}
              />
              <Route
                path="dashboard/course/:courseId/quizzes"
                element={<ManageQuizzes />}
              />
              <Route path="dashboard/LiveClass" element={<LiveClass />} />
            </>
          )}

          {/* Route only for Students */}
          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route
                path="dashboard/enrolled-courses"
                element={<EnrolledCourses />}
              />
              <Route path="/dashboard/cart" element={<Cart />} />
              <Route path="dashboard/wishlist" element={<Wishlist />} />
              <Route path="dashboard/certificates" element={<Certificates />} />
              <Route path="dashboard/achievements" element={<Achievements />} />
              <Route path="dashboard/live-classes" element={<StudentLiveClasses />} />
            </>
          )}

          <Route path="dashboard/settings" element={<Settings />} />

          {/* Routes only for Admins */}
          {user?.accountType === ACCOUNT_TYPE.ADMIN && (
            <>
              <Route path="dashboard/admin/coupons" element={<ManageCoupons />} />
              <Route path="dashboard/admin/audit-log" element={<AuditLog />} />
              <Route path="dashboard/admin/analytics" element={<PlatformAnalytics />} />
              <Route path="dashboard/admin/moderate-courses" element={<ModerateCourses />} />
              <Route path="dashboard/admin/users" element={<ManageUsers />} />
              <Route path="dashboard/admin/categories" element={<ManageCategories />} />
              <Route path="dashboard/admin/learning-paths" element={<ManageLearningPaths />} />
            </>
          )}
        </Route>

        {/* For the watching course lectures */}
        <Route
          element={
            <PrivateRoute>
              <ViewCourse />
            </PrivateRoute>
          }
        >
          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route
                path="view-course/:courseId/section/:sectionId/sub-section/:subSectionId"
                element={<VideoDetails />}
              />
              <Route path="view-course/:courseId/quizzes" element={<CourseQuizzes />} />
              <Route path="view-course/:courseId/quiz/:quizId" element={<TakeQuiz />} />
            </>
          )}
        </Route>

        {/* 404 Page */}
        <Route path="*" element={<Error />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>

      {/* ✅ Show ChatBot only if user is logged in */}
      {user && <ChatBot />}
    </div>
  )
}

export default App

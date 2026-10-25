import { useEffect, useState } from "react"
import "./App.css"
// Redux
import { useDispatch, useSelector } from "react-redux"
// React Router
import { Route, Routes, useLocation, useNavigate } from "react-router-dom"

// Components
import Navbar from "./components/Common/Navbar"
import OpenRoute from "./components/core/Auth/OpenRoute"
import PrivateRoute from "./components/core/Auth/PrivateRoute"
import AddCourse from "./components/core/Dashboard/AddCourse"
import Cart from "./components/core/Dashboard/Cart"
import EditCourse from "./components/core/Dashboard/EditCourse"
import EnrolledCourses from "./components/core/Dashboard/EnrolledCourses"
import Instructor from "./components/core/Dashboard/Instructor"
import MyCourses from "./components/core/Dashboard/MyCourses"
import MyProfile from "./components/core/Dashboard/MyProfile"
import LiveClass from "./components/core/Dashboard/LiveClass"
import Settings from "./components/core/Dashboard/Settings"
import Wishlist from "./components/core/Dashboard/Wishlist"
import Certificates from "./components/core/Dashboard/Certificates"
import Achievements from "./components/core/Dashboard/Achievements"
import StudentLiveClasses from "./components/core/Dashboard/StudentLiveClasses"
import ManageQuizzes from "./components/core/Dashboard/ManageQuizzes"
import ManageCoupons from "./components/core/Dashboard/Admin/ManageCoupons"
import AuditLog from "./components/core/Dashboard/Admin/AuditLog"
import ModerateCourses from "./components/core/Dashboard/Admin/ModerateCourses"
import ManageUsers from "./components/core/Dashboard/Admin/ManageUsers"
import ManageCategories from "./components/core/Dashboard/Admin/ManageCategories"
import ManageLearningPaths from "./components/core/Dashboard/Admin/ManageLearningPaths"
import PlatformAnalytics from "./components/core/Dashboard/Admin/PlatformAnalytics"
import VideoDetails from "./components/core/ViewCourse/VideoDetails"
import CourseQuizzes from "./components/core/ViewCourse/CourseQuizzes"
import TakeQuiz from "./components/core/ViewCourse/TakeQuiz"
import About from "./pages/About"
import Catalog from "./pages/Catalog"
import Contact from "./pages/Contact"
import CourseDetails from "./pages/CourseDetails"
import Dashboard from "./pages/Dashboard"
import Error from "./pages/Error"
import ForgotPassword from "./pages/ForgotPassword"
import SearchResults from "./pages/SearchResults"
import VerifyCertificate from "./pages/VerifyCertificate"
import LearningPaths from "./pages/LearningPaths"
import LearningPathDetails from "./pages/LearningPathDetails"
import LegalPage from "./pages/LegalPage"
import ErrorBoundary from "./components/Common/ErrorBoundary"
import ChatBot from "./components/Common/ChatBot"
// Pages
import Home from "./pages/Home"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import UpdatePassword from "./pages/UpdatePassword"
import VerifyEmail from "./pages/VerifyEmail"
import ViewCourse from "./pages/ViewCourse"
import { getUserDetails } from "./services/operations/profileAPI"
import { loadWishlistIds } from "./services/operations/wishlistAPI"
import { ACCOUNT_TYPE } from "./utils/constants"
import { titleFor } from "./utils/pageTitle"

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
      </ErrorBoundary>

      {/* ✅ Show ChatBot only if user is logged in */}
      {user && <ChatBot />}
    </div>
  )
}

export default App

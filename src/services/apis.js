const BASE_URL = process.env.REACT_APP_BASE_URL;

// AUTH ENDPOINTS
export const endpoints = {
  SENDOTP_API: BASE_URL + "/api/v1/auth/sendotp",
  SIGNUP_API: BASE_URL + "/api/v1/auth/signup",
  LOGIN_API: BASE_URL + "/api/v1/auth/login",
  LOGOUT_API: BASE_URL + "/api/v1/auth/logout",
  LOGIN_2FA_API: BASE_URL + "/api/v1/auth/login/2fa",
  RESETPASSTOKEN_API: BASE_URL + "/api/v1/auth/reset-password-token",
  RESETPASSWORD_API: BASE_URL + "/api/v1/auth/reset-password",
};

// PROFILE ENDPOINTS
export const profileEndpoints = {
  GET_USER_DETAILS_API: BASE_URL + "/api/v1/profile/getUserDetails",
  GET_USER_ENROLLED_COURSES_API: BASE_URL + "/api/v1/profile/getEnrolledCourses",
  GET_INSTRUCTOR_DATA_API: BASE_URL + "/api/v1/profile/instructorDashboard",
  GET_MY_BADGES_API: BASE_URL + "/api/v1/profile/badges",
};

// DISCUSSION (per-lecture Q&A) ENDPOINTS
export const discussionEndpoints = {
  CREATE_DISCUSSION_API: BASE_URL + "/api/v1/discussion/create",
  GET_DISCUSSIONS_API: BASE_URL + "/api/v1/discussion/subsection",
  DELETE_DISCUSSION_API: BASE_URL + "/api/v1/discussion/delete",
};

// LIVE CLASS ENDPOINTS
export const liveClassEndpoints = {
  CREATE_LIVE_CLASS_API: BASE_URL + "/api/v1/live-class/create",
  GET_INSTRUCTOR_LIVE_CLASSES_API: BASE_URL + "/api/v1/live-class/instructor",
  GET_STUDENT_LIVE_CLASSES_API: BASE_URL + "/api/v1/live-class/student",
  DELETE_LIVE_CLASS_API: BASE_URL + "/api/v1/live-class/delete",
};

// LEARNING PATH ENDPOINTS
export const learningPathEndpoints = {
  GET_ALL_LEARNING_PATHS_API: BASE_URL + "/api/v1/learning-path/all",
  GET_LEARNING_PATH_DETAILS_API: BASE_URL + "/api/v1/learning-path", // + /:pathId
  CREATE_LEARNING_PATH_API: BASE_URL + "/api/v1/learning-path/create",
  UPDATE_LEARNING_PATH_API: BASE_URL + "/api/v1/learning-path/update",
  DELETE_LEARNING_PATH_API: BASE_URL + "/api/v1/learning-path/delete",
};

// STUDENTS ENDPOINTS
export const studentEndpoints = {
  COURSE_PAYMENT_API: BASE_URL + "/api/v1/payment/capturePayment",
  COURSE_VERIFY_API: BASE_URL + "/api/v1/payment/verifyPayment",
  SEND_PAYMENT_SUCCESS_EMAIL_API: BASE_URL + "/api/v1/payment/sendPaymentSuccessEmail",
};

// COURSE ENDPOINTS
export const courseEndpoints = {
  GET_ALL_COURSE_API: BASE_URL + "/api/v1/course/getAllCourses",
  COURSE_DETAILS_API: BASE_URL + "/api/v1/course/getCourseDetails",
  EDIT_COURSE_API: BASE_URL + "/api/v1/course/editCourse",
  COURSE_CATEGORIES_API: BASE_URL + "/api/v1/course/showAllCategories",
  CREATE_COURSE_API: BASE_URL + "/api/v1/course/createCourse",
  CREATE_SECTION_API: BASE_URL + "/api/v1/course/addSection",
  CREATE_SUBSECTION_API: BASE_URL + "/api/v1/course/addSubSection",
  UPDATE_SECTION_API: BASE_URL + "/api/v1/course/updateSection",
  UPDATE_SUBSECTION_API: BASE_URL + "/api/v1/course/updateSubSection",
  GET_ALL_INSTRUCTOR_COURSES_API: BASE_URL + "/api/v1/course/getInstructorCourses",
  DELETE_SECTION_API: BASE_URL + "/api/v1/course/deleteSection",
  DELETE_SUBSECTION_API: BASE_URL + "/api/v1/course/deleteSubSection",
  DELETE_COURSE_API: BASE_URL + "/api/v1/course/deleteCourse",
  GET_FULL_COURSE_DETAILS_AUTHENTICATED: BASE_URL + "/api/v1/course/getFullCourseDetails",
  LECTURE_COMPLETION_API: BASE_URL + "/api/v1/course/updateCourseProgress",
  CREATE_RATING_API: BASE_URL + "/api/v1/course/createRating",
  SEARCH_COURSES_API: BASE_URL + "/api/v1/course/searchCourses",
  UPDATE_WATCH_POSITION_API: BASE_URL + "/api/v1/course/updateWatchPosition",
  UPLOAD_SIGNATURE_API: BASE_URL + "/api/v1/course/uploadSignature",
  GENERATE_COURSE_DESCRIPTION_API: BASE_URL + "/api/v1/course/generateDescription",
  GET_RECOMMENDED_COURSES_API: BASE_URL + "/api/v1/course/recommendations",
};

// NOTES ENDPOINTS (per-lecture, timestamped notes)
export const notesEndpoints = {
  CREATE_NOTE_API: BASE_URL + "/api/v1/notes/create",
  GET_NOTES_API: BASE_URL + "/api/v1/notes",
  DELETE_NOTE_API: BASE_URL + "/api/v1/notes/delete",
};

// QUIZ ENDPOINTS
export const quizEndpoints = {
  CREATE_QUIZ_API: BASE_URL + "/api/v1/quiz/create",
  GET_QUIZZES_INSTRUCTOR_API: BASE_URL + "/api/v1/quiz/instructor",
  DELETE_QUIZ_API: BASE_URL + "/api/v1/quiz/delete",
  GET_QUIZZES_STUDENT_API: BASE_URL + "/api/v1/quiz/student",
  SUBMIT_QUIZ_API: BASE_URL + "/api/v1/quiz/submit",
  GENERATE_QUIZ_DRAFT_API: BASE_URL + "/api/v1/quiz/generate-draft",
};

// CERTIFICATE ENDPOINTS
export const certificateEndpoints = {
  GET_MY_CERTIFICATES_API: BASE_URL + "/api/v1/certificate/mine",
  DOWNLOAD_CERTIFICATE_API: BASE_URL + "/api/v1/certificate/download",
  VERIFY_CERTIFICATE_API: BASE_URL + "/api/v1/certificate/verify",
};

// WISHLIST ENDPOINTS
export const wishlistEndpoints = {
  GET_WISHLIST_API: BASE_URL + "/api/v1/profile/wishlist",
  ADD_TO_WISHLIST_API: BASE_URL + "/api/v1/profile/wishlist/add",
  REMOVE_FROM_WISHLIST_API: BASE_URL + "/api/v1/profile/wishlist/remove",
};

// ADMIN ENDPOINTS
export const adminEndpoints = {
  GET_PENDING_COURSES_API: BASE_URL + "/api/v1/admin/courses/pending",
  GET_ARCHIVED_COURSES_API: BASE_URL + "/api/v1/admin/courses/archived",
  RESTORE_COURSE_API: BASE_URL + "/api/v1/admin/courses/restore",
  APPROVE_COURSE_API: BASE_URL + "/api/v1/admin/courses/approve",
  REJECT_COURSE_API: BASE_URL + "/api/v1/admin/courses/reject",
  GET_ALL_USERS_ADMIN_API: BASE_URL + "/api/v1/admin/users",
  SET_USER_ACTIVE_API: BASE_URL + "/api/v1/admin/users/set-active",
  GET_PLATFORM_ANALYTICS_API: BASE_URL + "/api/v1/admin/analytics",
  UPDATE_CATEGORY_API: BASE_URL + "/api/v1/course/updateCategory",
  DELETE_CATEGORY_API: BASE_URL + "/api/v1/course/deleteCategory",
  CREATE_CATEGORY_API: BASE_URL + "/api/v1/course/createCategory",
  GET_AUDIT_LOGS_API: BASE_URL + "/api/v1/admin/audit-logs",
};

// NOTIFICATION ENDPOINTS
export const notificationEndpoints = {
  GET_MY_NOTIFICATIONS_API: BASE_URL + "/api/v1/notification/mine",
  MARK_NOTIFICATION_READ_API: BASE_URL + "/api/v1/notification/mark-read",
  MARK_ALL_NOTIFICATIONS_READ_API: BASE_URL + "/api/v1/notification/mark-all-read",
};

// COUPON ENDPOINTS
export const couponEndpoints = {
  VALIDATE_COUPON_API: BASE_URL + "/api/v1/coupon/validate",
  CREATE_COUPON_API: BASE_URL + "/api/v1/coupon/create",
  GET_ALL_COUPONS_API: BASE_URL + "/api/v1/coupon/all",
  SET_COUPON_ACTIVE_API: BASE_URL + "/api/v1/coupon/set-active",
};

// RATINGS AND REVIEWS
export const ratingsEndpoints = {
  REVIEWS_DETAILS_API: BASE_URL + "/api/v1/course/getReviews",
};

// CATEGORIES API
export const categories = {
  CATEGORIES_API: BASE_URL + "/api/v1/course/showAllCategories",
};

// CATALOG PAGE DATA
export const catalogData = {
  CATALOGPAGEDATA_API: BASE_URL + "/api/v1/course/getCategoryPageDetails",
};

// CONTACT-US API
export const contactusEndpoint = {
  CONTACT_US_API: BASE_URL + "/api/v1/reach/contact",
};

// CHATBOT API
export const chatbotEndpoints = {
  CHATBOT_API: BASE_URL + "/api/v1/chatbot/chat",
};

// SETTINGS PAGE API
export const settingsEndpoints = {
  UPDATE_DISPLAY_PICTURE_API: BASE_URL + "/api/v1/profile/updateDisplayPicture",
  UPDATE_PROFILE_API: BASE_URL + "/api/v1/profile/updateProfile",
  CHANGE_PASSWORD_API: BASE_URL + "/api/v1/auth/changepassword",
  DELETE_PROFILE_API: BASE_URL + "/api/v1/profile/deleteProfile",
};

// ACCOUNT SECURITY (sessions + two-factor authentication)
export const securityEndpoints = {
  SESSIONS_API: BASE_URL + "/api/v1/auth/sessions",
  REVOKE_SESSION_API: BASE_URL + "/api/v1/auth/sessions/revoke",
  LOGOUT_ALL_API: BASE_URL + "/api/v1/auth/logout-all",
  TWO_FA_SETUP_API: BASE_URL + "/api/v1/auth/2fa/setup",
  TWO_FA_ENABLE_API: BASE_URL + "/api/v1/auth/2fa/enable",
  TWO_FA_DISABLE_API: BASE_URL + "/api/v1/auth/2fa/disable",
};

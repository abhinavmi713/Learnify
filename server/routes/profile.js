const express = require("express")
const router = express.Router()
const { auth, isInstructor } = require("../middleware/auth")
const { validate } = require("../middleware/validate")
const { updateProfileSchema, courseIdSchema } = require("../validators/miscValidators")
const {
  deleteAccount,
  updateProfile,
  getAllUserDetails,
  updateDisplayPicture,
  getEnrolledCourses,
  instructorDashboard,
  getMyBadges,
} = require("../controllers/profile")
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} = require("../controllers/Wishlist")

// ********************************************************************************************************
//                                      Profile routes
// ********************************************************************************************************
// Delet User Account
router.delete("/deleteProfile", auth, deleteAccount)
router.put("/updateProfile", auth, validate(updateProfileSchema), updateProfile)
router.get("/getUserDetails", auth, getAllUserDetails)
// Get Enrolled Courses
router.get("/getEnrolledCourses", auth, getEnrolledCourses)
router.put("/updateDisplayPicture", auth, updateDisplayPicture)
router.get("/instructorDashboard", auth, isInstructor, instructorDashboard)
router.get("/badges", auth, getMyBadges)

// ********************************************************************************************************
//                                      Wishlist routes
// ********************************************************************************************************
router.get("/wishlist", auth, getWishlist)
router.post("/wishlist/add", auth, validate(courseIdSchema), addToWishlist)
router.post("/wishlist/remove", auth, validate(courseIdSchema), removeFromWishlist)
module.exports = router

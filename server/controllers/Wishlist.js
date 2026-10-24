const mongoose = require("mongoose")
const User = require("../models/User")

exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "wishlist",
      populate: [
        { path: "instructor", select: "firstName lastName image additionalDetails" },
        { path: "ratingAndReviews" },
      ],
    })
    return res.status(200).json({ success: true, data: user.wishlist })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch wishlist" })
  }
}

exports.addToWishlist = async (req, res) => {
  try {
    const { courseId } = req.body
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" })
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { wishlist: courseId } },
      { new: true }
    )
    return res.status(200).json({ success: true, data: user.wishlist })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to add to wishlist" })
  }
}

exports.removeFromWishlist = async (req, res) => {
  try {
    const { courseId } = req.body
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: "Invalid courseId" })
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { wishlist: courseId } },
      { new: true }
    )
    return res.status(200).json({ success: true, data: user.wishlist })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to remove from wishlist" })
  }
}

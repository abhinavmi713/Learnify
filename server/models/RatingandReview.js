const mongoose = require("mongoose");

// Define the RatingAndReview schema
const ratingAndReviewSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		required: true,
		ref: "user",
	},
	rating: {
		type: Number,
		required: true,
	},
	review: {
		type: String,
		required: true,
	},
	course: {
		type: mongoose.Schema.Types.ObjectId,
		required: true,
		ref: "Course",
		index: true,
	},
});

// Export the RatingAndReview model
// One review per student per course. A check in code can't guarantee this.
ratingAndReviewSchema.index({ user: 1, course: 1 }, { unique: true })

module.exports = mongoose.model("RatingAndReview", ratingAndReviewSchema);

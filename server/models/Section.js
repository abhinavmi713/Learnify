const mongoose = require("mongoose");

// Define the Section schema
const sectionSchema = new mongoose.Schema({
	sectionName: {
		type: String,
	},
	subSection: [
		{
			type: mongoose.Schema.Types.ObjectId,
			required: true,
			ref: "SubSection",
		},
	],
});

// Export the Section model
// Which section holds a lecture.
sectionSchema.index({ subSection: 1 })

module.exports = mongoose.model("Section", sectionSchema);

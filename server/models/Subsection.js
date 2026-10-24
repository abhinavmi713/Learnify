const mongoose = require("mongoose");

const SubSectionSchema = new mongoose.Schema({
	title: { type: String },
	timeDuration: { type: String },
	description: { type: String },
	videoUrl: { type: String },
	// Populated by an auto-captioning pipeline (planned) — a VTT/SRT file URL, if generated.
	captionsUrl: { type: String, default: null },
});

module.exports = mongoose.model("SubSection", SubSectionSchema);

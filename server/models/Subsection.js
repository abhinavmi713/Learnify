const mongoose = require("mongoose");

const SubSectionSchema = new mongoose.Schema({
	title: { type: String },
	timeDuration: { type: String },
	description: { type: String },
	videoUrl: { type: String },
	// Populated by an auto-captioning pipeline (planned) — a VTT/SRT file URL, if generated.
	captionsUrl: { type: String, default: null },
	// Optional lecture transcript or notes. Indexed by the AI service so the
	// course assistant can answer from what is actually said in the lecture.
	transcript: { type: String, default: "", maxlength: 20000 },
});

module.exports = mongoose.model("SubSection", SubSectionSchema);

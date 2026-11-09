const mongoose = require("mongoose")

// Global Mongoose settings, loaded before any model is defined.
//
// runValidators: updateOne/findOneAndUpdate check the schema (enums, ranges) the
//   same way save() does. Without it, an update could write status "Nope".
// autoIndex: off in production, where building a new index on a large
//   collection at startup is risky; run `npm run db:indexes` during a deploy.
mongoose.set("runValidators", true)
mongoose.set("autoIndex", process.env.NODE_ENV !== "production")

module.exports = mongoose

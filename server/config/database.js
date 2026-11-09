const mongoose = require("mongoose");
require("dotenv").config();

const { MONGODB_URL } = process.env;

exports.connect = () => {
	mongoose
		.connect(MONGODB_URL)
		.then(() => {
			console.log(`DB Connection Success`);
			// Mongoose builds indexes itself outside production (autoIndex).
			if (!mongoose.get("autoIndex")) require("../utils/ensureIndexes").ensureIndexes();
		})
		.catch((err) => {
			console.log(`DB Connection Failed`);
			console.log(err);
			process.exit(1);
		});
};

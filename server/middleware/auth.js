// Importing required modules
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const User = require("../models/User");
const { isRevoked } = require("../utils/tokenRevocation");
// Configuring dotenv to load environment variables from .env file
dotenv.config();

// This function is used as middleware to authenticate user requests
exports.auth = async (req, res, next) => {
	try {
		// Extracting JWT from request cookies, body or header
		const token =
			req.cookies.token ||
			req.body.token ||
			req.header("Authorization")?.replace("Bearer ", "");

		// If JWT is missing, return 401 Unauthorized response
		if (!token) {
			return res.status(401).json({ success: false, message: `Token Missing` });
		}

		let decode;
		try {
			// Verifying the JWT using the secret key stored in environment variables
			decode = await jwt.verify(token, process.env.JWT_SECRET);
		} catch (error) {
			// If JWT verification fails, return 401 Unauthorized response
			return res
				.status(401)
				.json({ success: false, message: "token is invalid" });
		}

		// A token that was explicitly logged out must stop working even though its
		// signature and expiry are still valid.
		if (await isRevoked(decode.jti)) {
			return res
				.status(401)
				.json({ success: false, message: "Session ended. Please log in again." });
		}

		// A deactivated account's outstanding tokens must stop working the
		// moment an admin deactivates it, not just block the next login —
		// otherwise deactivation only ever affects someone who wasn't already
		// logged in.
		const user = await User.findById(decode.id);
		if (!user) {
			return res.status(401).json({ success: false, message: "User not found" });
		}
		if (user.active === false) {
			return res.status(403).json({
				success: false,
				message: "Your account has been deactivated. Please contact support.",
			});
		}

		// A password change bumps tokenVersion (see changePassword/resetPassword),
		// which immediately invalidates every token issued before that change —
		// otherwise a token stolen before the password change stays valid until
		// it naturally expires.
		if ((decode.tokenVersion || 0) !== (user.tokenVersion || 0)) {
			return res.status(401).json({
				success: false,
				message: "Your session has expired. Please log in again.",
			});
		}

		// Storing the decoded JWT payload in the request object for further use
		req.user = decode;
		next();
	} catch (error) {
		// If there is an error during the authentication process, return 401 Unauthorized response
		return res.status(401).json({
			success: false,
			message: `Something Went Wrong While Validating the Token`,
		});
	}
};
exports.isStudent = async (req, res, next) => {
	try {
		const userDetails = await User.findById(req.user.id);

		if (userDetails.accountType !== "Student") {
			return res.status(401).json({
				success: false,
				message: "This is a Protected Route for Students",
			});
		}
		next();
	} catch (error) {
		return res
			.status(500)
			.json({ success: false, message: `User Role Can't be Verified` });
	}
};
exports.isAdmin = async (req, res, next) => {
	try {
		const userDetails = await User.findById(req.user.id);

		if (userDetails.accountType !== "Admin") {
			return res.status(401).json({
				success: false,
				message: "This is a Protected Route for Admin",
			});
		}
		next();
	} catch (error) {
		return res
			.status(500)
			.json({ success: false, message: `User Role Can't be Verified` });
	}
};
exports.isInstructor = async (req, res, next) => {
	try {
		const userDetails = await User.findById(req.user.id);

		if (userDetails.accountType !== "Instructor") {
			return res.status(401).json({
				success: false,
				message: "This is a Protected Route for Instructor",
			});
		}
		next();
	} catch (error) {
		return res
			.status(500)
			.json({ success: false, message: `User Role Can't be Verified` });
	}
};

// Importing required modules
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const User = require("../models/User");
const { isRevoked } = require("../utils/tokenRevocation");
// Configuring dotenv to load environment variables from .env file
dotenv.config();

class AuthError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

// Verifies an access token and the account behind it. Shared by the HTTP
// middleware below and the Socket.IO handshake (realtime/index.js) so both
// enforce exactly the same rules. Resolves { decoded, user } or throws AuthError.
async function verifyAccessToken(token) {
	if (!token) throw new AuthError(401, "Token Missing");

	let decode;
	try {
		decode = jwt.verify(token, process.env.JWT_SECRET);
	} catch (error) {
		throw new AuthError(401, "token is invalid");
	}

	// A token that was explicitly logged out must stop working even though its
	// signature and expiry are still valid.
	if (await isRevoked(decode.jti)) {
		throw new AuthError(401, "Session ended. Please log in again.");
	}

	// A deactivated account's outstanding tokens must stop working the moment
	// an admin deactivates it, not just block the next login.
	const user = await User.findById(decode.id);
	if (!user) throw new AuthError(401, "User not found");
	if (user.active === false) {
		throw new AuthError(403, "Your account has been deactivated. Please contact support.");
	}

	// A password change bumps tokenVersion, which immediately invalidates every
	// token issued before that change.
	if ((decode.tokenVersion || 0) !== (user.tokenVersion || 0)) {
		throw new AuthError(401, "Your session has expired. Please log in again.");
	}

	return { decoded: decode, user };
}
exports.verifyAccessToken = verifyAccessToken;
exports.AuthError = AuthError;

// This function is used as middleware to authenticate user requests
exports.auth = async (req, res, next) => {
	// Extracting JWT from request cookies, body or header
	const token =
		req.cookies.token ||
		req.body?.token ||
		req.header("Authorization")?.replace("Bearer ", "");
	try {
		const { decoded } = await verifyAccessToken(token);
		req.user = decoded;
		next();
	} catch (error) {
		if (error instanceof AuthError) {
			return res.status(error.status).json({ success: false, message: error.message });
		}
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

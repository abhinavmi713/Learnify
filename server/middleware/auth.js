// Importing required modules
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const User = require("../models/User");
const { isRevoked } = require("../utils/tokenRevocation");
const { can } = require("../config/permissions");
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

// Authenticates the request from its `Authorization: Bearer <access token>`
// header. Only the header is accepted: a cookie-borne access token would make
// every authenticated route a CSRF target. (The refresh token is a cookie, but it
// is scoped to /api/v1/auth and only ever exchanged for a new access token.)
exports.auth = async (req, res, next) => {
	const header = req.header("Authorization") || "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;
	try {
		const { decoded, user } = await verifyAccessToken(token);
		// The role comes from the database, not the token, so a role change or
		// demotion applies to the very next request.
		req.user = { ...decoded, accountType: user.accountType };
		req.authUser = user;
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

// Like `auth`, but lets the request through without a user when there is no
// valid token (req.user stays undefined).
exports.optionalAuth = async (req, res, next) => {
	const header = req.header("Authorization") || "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;
	if (token) {
		try {
			const { decoded, user } = await verifyAccessToken(token);
			req.user = { ...decoded, accountType: user.accountType };
			req.authUser = user;
		} catch (error) {
			// ignore: treated as anonymous
		}
	}
	next();
};

// Authorization. 401 means "who are you?" (handled by `auth`); 403 means "we know
// who you are and you may not do this".
const forbidden = (res, message) => res.status(403).json({ success: false, message });

// Requires every listed permission (see config/permissions.js).
exports.requirePermission = (...permissions) => (req, res, next) => {
	const role = req.user?.accountType;
	if (permissions.every((p) => can(role, p))) return next();
	return forbidden(res, "You do not have permission to do this");
};

const requireRole = (role, message) => (req, res, next) =>
	req.user?.accountType === role ? next() : forbidden(res, message);

exports.isStudent = requireRole("Student", "This is a Protected Route for Students");
exports.isAdmin = requireRole("Admin", "This is a Protected Route for Admin");
exports.isInstructor = requireRole("Instructor", "This is a Protected Route for Instructor");

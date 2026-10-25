// Role-based access control. Routes ask for a permission ("coupon:manage"), not
// a role, so what each role may do is decided in this one table and can change
// without touching route code.
const ROLE_PERMISSIONS = {
  Student: ["course:purchase", "course:learn", "coupon:redeem", "review:write"],
  Instructor: ["course:author", "quiz:author", "liveclass:host", "analytics:own", "webhook:manage"],
  Admin: [
    "course:moderate",
    "user:read",
    "user:manage",
    "coupon:manage",
    "category:manage",
    "analytics:platform",
    "audit:read",
  ],
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || []
}

function can(role, permission) {
  return permissionsFor(role).includes(permission)
}

module.exports = { ROLE_PERMISSIONS, permissionsFor, can }

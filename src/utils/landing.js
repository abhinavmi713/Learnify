import { ACCOUNT_TYPE } from "./constants"

// Where a user should land after logging in (and when they open /login while
// already signed in): the screen they actually use, not their profile.
export function landingPathFor(user) {
  switch (user?.accountType) {
    case ACCOUNT_TYPE.STUDENT:
      return "/dashboard/enrolled-courses"
    case ACCOUNT_TYPE.INSTRUCTOR:
      return "/dashboard/instructor"
    case "Admin":
      return "/dashboard/admin/analytics"
    default:
      return "/dashboard/my-profile"
  }
}

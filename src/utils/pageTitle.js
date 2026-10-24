// Browser-tab titles per route. First matching pattern wins.
const TITLES = [
  [/^\/$/, "Learnify — learn skills that move your career"],
  [/^\/about/, "About"],
  [/^\/contact/, "Contact us"],
  [/^\/search/, "Search courses"],
  [/^\/catalog\//, "Catalog"],
  [/^\/courses\//, "Course"],
  [/^\/learning-paths/, "Learning paths"],
  [/^\/verify-certificate/, "Verify certificate"],
  [/^\/login/, "Log in"],
  [/^\/signup/, "Sign up"],
  [/^\/forgot-password/, "Forgot password"],
  [/^\/update-password/, "Reset password"],
  [/^\/verify-email/, "Verify email"],
  [/^\/terms/, "Terms of Service"],
  [/^\/privacy-policy/, "Privacy Policy"],
  [/^\/refund-policy/, "Refund Policy"],
  [/^\/cookie-policy/, "Cookie Policy"],
  [/^\/view-course/, "Course player"],
  [/^\/dashboard\/my-profile/, "My profile"],
  [/^\/dashboard\/enrolled-courses/, "Enrolled courses"],
  [/^\/dashboard\/instructor/, "Instructor dashboard"],
  [/^\/dashboard\/my-courses/, "My courses"],
  [/^\/dashboard\/add-course/, "Add course"],
  [/^\/dashboard\/edit-course/, "Edit course"],
  [/^\/dashboard\/cart/, "Cart"],
  [/^\/dashboard\/wishlist/, "Wishlist"],
  [/^\/dashboard\/certificates/, "Certificates"],
  [/^\/dashboard\/achievements/, "Achievements"],
  [/^\/dashboard\/settings/, "Settings"],
  [/^\/dashboard\/live-classes/, "Live classes"],
  [/^\/dashboard\/LiveClass/, "Live classes"],
  [/^\/dashboard\/course\/[^/]+\/quizzes/, "Manage quizzes"],
  [/^\/dashboard\/admin\/analytics/, "Platform analytics"],
  [/^\/dashboard\/admin\/moderate-courses/, "Moderate courses"],
  [/^\/dashboard\/admin\/users/, "Manage users"],
  [/^\/dashboard\/admin\/categories/, "Manage categories"],
  [/^\/dashboard\/admin\/coupons/, "Coupons"],
  [/^\/dashboard\/admin\/learning-paths/, "Manage learning paths"],
  [/^\/dashboard\/admin/, "Admin"],
  [/^\/dashboard/, "Dashboard"],
]

export function titleFor(pathname) {
  const hit = TITLES.find(([re]) => re.test(pathname))
  if (!hit) return "Page not found · Learnify"
  return hit[1].startsWith("Learnify") ? hit[1] : `${hit[1]} · Learnify`
}

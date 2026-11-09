// Runs before every production build (npm run build). On Vercel, a missing
// REACT_APP_BASE_URL would build an app whose API calls hit Vercel's rewrite to
// index.html and whose live features are silently off, so fail the build there.
// Elsewhere (local builds, CI) it only warns.
const missing = !process.env.REACT_APP_BASE_URL
if (missing && process.env.VERCEL) {
  console.error("REACT_APP_BASE_URL is not set. Set it to the API's URL in the Vercel project settings.")
  process.exit(1)
}
if (missing) console.warn("Warning: REACT_APP_BASE_URL is not set; the built app will not reach the API.")

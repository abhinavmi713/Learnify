const cloudinary = require("cloudinary").v2

// Lets the browser upload a large video straight to Cloudinary instead of
// streaming it through this server (which hits request-size/timeout limits on
// most hosts and ties up a Node process per upload). The server never sees the
// bytes: it only signs the upload parameters and later checks the URL it gets
// back really points into *our* Cloudinary account.

function getCredentials() {
  const cloudName = process.env.CLOUD_NAME
  const apiKey = process.env.API_KEY
  const apiSecret = process.env.API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured (set CLOUD_NAME, API_KEY and API_SECRET)")
  }
  return { cloudName, apiKey, apiSecret }
}

// The signature covers exactly the params the browser must send back
// (`folder` + `timestamp`), so it can't be reused to upload somewhere else,
// and Cloudinary itself rejects signatures older than ~1 hour.
function signVideoUpload() {
  const { cloudName, apiKey, apiSecret } = getCredentials()
  const timestamp = Math.round(Date.now() / 1000)
  const folder = process.env.FOLDER_NAME
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret)
  return { cloudName, apiKey, timestamp, folder, signature }
}

// Folders our own videos may live in: the current upload folder plus any
// previous ones (LEGACY_FOLDER_NAMES, comma-separated), so renaming the upload
// folder never invalidates lectures that were uploaded before the change.
function trustedFolders() {
  const { FOLDER_NAME, LEGACY_FOLDER_NAMES } = process.env
  return [FOLDER_NAME, ...(LEGACY_FOLDER_NAMES || "").split(",")].map((f) => (f || "").trim()).filter(Boolean)
}

// True only for a video that lives in our own account (and folder). Without
// this check an instructor could attach any URL on the internet as a lecture.
function isTrustedVideoUrl(url) {
  if (typeof url !== "string") return false
  const { CLOUD_NAME } = process.env
  if (!CLOUD_NAME) return false
  const prefix = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/`
  if (!url.startsWith(prefix)) return false
  const folders = trustedFolders()
  return folders.length ? folders.some((f) => url.includes(`/${f}/`)) : true
}

module.exports = { signVideoUpload, isTrustedVideoUrl }

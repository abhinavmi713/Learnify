import axios from "axios"

import { apiConnector } from "../apiConnector"
import { courseEndpoints } from "../apis"

const { UPLOAD_SIGNATURE_API } = courseEndpoints

// Uploads a lecture video straight from the browser to Cloudinary using
// short-lived params signed by our server, instead of streaming the whole file
// through the API (which hits request-size/timeout limits on most hosts).
// Resolves with { url, duration }; `onProgress` receives 0-100.
export async function uploadVideoDirect(file, token, onProgress) {
  const sig = await apiConnector("POST", UPLOAD_SIGNATURE_API, null, {
    Authorization: `Bearer ${token}`,
  })
  const { cloudName, apiKey, timestamp, folder, signature } = sig.data.data

  const form = new FormData()
  form.append("file", file)
  form.append("api_key", apiKey)
  form.append("timestamp", timestamp)
  form.append("folder", folder)
  form.append("signature", signature)

  // A bare axios call: this goes to Cloudinary, not our API, so it must not
  // carry our base URL or our Authorization header.
  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    form,
    {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    }
  )

  return { url: response.data.secure_url, duration: response.data.duration }
}

import { toast } from "react-hot-toast"

import { apiConnector, axiosInstance } from "../apiConnector"
import { certificateEndpoints } from "../apis"

const { GET_MY_CERTIFICATES_API, DOWNLOAD_CERTIFICATE_API, VERIFY_CERTIFICATE_API } =
  certificateEndpoints

export async function getMyCertificates(token) {
  try {
    const response = await apiConnector("GET", GET_MY_CERTIFICATES_API, null, {
      Authorization: `Bearer ${token}`,
    })
    if (!response?.data?.success) throw new Error("Could not fetch certificates")
    return response.data.data
  } catch (error) {
    console.log("GET_MY_CERTIFICATES_API ERROR............", error)
    return []
  }
}

// Downloads the certificate PDF and triggers a browser save-as, without
// ever navigating away (the endpoint needs an Authorization header, which a
// plain <a href> link can't send).
export async function downloadCertificate(certificateId, token) {
  try {
    const response = await axiosInstance({
      method: "GET",
      url: `${DOWNLOAD_CERTIFICATE_API}/${certificateId}`,
      headers: { Authorization: `Bearer ${token}` },
      responseType: "blob",
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `certificate-${certificateId}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.log("DOWNLOAD_CERTIFICATE_API ERROR............", error)
    toast.error("Could not download certificate")
  }
}

export async function verifyCertificate(certificateId) {
  try {
    const response = await apiConnector("GET", `${VERIFY_CERTIFICATE_API}/${certificateId}`)
    return response.data
  } catch (error) {
    console.log("VERIFY_CERTIFICATE_API ERROR............", error)
    return error?.response?.data || { success: false, valid: false }
  }
}

import { toast } from "react-hot-toast"

import { apiConnector } from "../apiConnector"
import { webhookEndpoints } from "../apis"

const { WEBHOOKS_API } = webhookEndpoints
const auth = (token) => ({ Authorization: `Bearer ${token}` })
const fail = (error, fallback) => {
  toast.error(error?.response?.data?.message || fallback)
  return null
}

export async function listWebhooks(token) {
  try {
    return (await apiConnector("GET", WEBHOOKS_API, null, auth(token))).data.data
  } catch (error) {
    return fail(error, "Could not load webhooks") || []
  }
}

export async function listWebhookEvents(token) {
  try {
    return (await apiConnector("GET", `${WEBHOOKS_API}/events`, null, auth(token))).data.data
  } catch (error) {
    return []
  }
}

// Resolves to the created webhook including its signing secret (shown once).
export async function createWebhook(token, body) {
  try {
    const res = await apiConnector("POST", WEBHOOKS_API, body, auth(token))
    toast.success("Webhook added")
    return res.data.data
  } catch (error) {
    return fail(error, "Could not add the webhook")
  }
}

export async function updateWebhook(token, id, body) {
  try {
    return (await apiConnector("POST", `${WEBHOOKS_API}/${id}/update`, body, auth(token))).data.data
  } catch (error) {
    return fail(error, "Could not update the webhook")
  }
}

export async function rotateWebhookSecret(token, id) {
  try {
    return (await apiConnector("POST", `${WEBHOOKS_API}/${id}/rotate-secret`, null, auth(token))).data.data.secret
  } catch (error) {
    return fail(error, "Could not rotate the secret")
  }
}

export async function deleteWebhook(token, id) {
  try {
    await apiConnector("DELETE", `${WEBHOOKS_API}/${id}`, null, auth(token))
    toast.success("Webhook deleted")
    return true
  } catch (error) {
    return Boolean(fail(error, "Could not delete the webhook"))
  }
}

export async function sendTestWebhook(token, id) {
  try {
    await apiConnector("POST", `${WEBHOOKS_API}/${id}/test`, null, auth(token))
    toast.success("Test delivery sent")
    return true
  } catch (error) {
    return Boolean(fail(error, "Could not send a test delivery"))
  }
}

export async function listDeliveries(token, id, before = "") {
  try {
    const res = await apiConnector("GET", `${WEBHOOKS_API}/${id}/deliveries`, null, auth(token), before ? { before } : null)
    return { items: res.data.data, nextCursor: res.data.nextCursor }
  } catch (error) {
    fail(error, "Could not load deliveries")
    return { items: [], nextCursor: null }
  }
}

export async function redeliver(token, deliveryId) {
  try {
    await apiConnector("POST", `${WEBHOOKS_API}/deliveries/${deliveryId}/redeliver`, null, auth(token))
    toast.success("Redelivery queued")
    return true
  } catch (error) {
    return Boolean(fail(error, "Could not redeliver"))
  }
}

import { apiConnector } from "../apiConnector"
import { notificationEndpoints } from "../apis"

const {
  GET_MY_NOTIFICATIONS_API,
  MARK_NOTIFICATION_READ_API,
  MARK_ALL_NOTIFICATIONS_READ_API,
} = notificationEndpoints

export async function getMyNotifications(token) {
  try {
    const res = await apiConnector("GET", GET_MY_NOTIFICATIONS_API, null, {
      Authorization: `Bearer ${token}`,
    })
    return {
      notifications: res?.data?.data || [],
      unreadCount: res?.data?.unreadCount || 0,
    }
  } catch (error) {
    return { notifications: [], unreadCount: 0 }
  }
}

export async function markNotificationRead(notificationId, token) {
  try {
    await apiConnector(
      "POST",
      MARK_NOTIFICATION_READ_API,
      { notificationId },
      { Authorization: `Bearer ${token}` }
    )
  } catch (error) {
    // Silent — a failed read-receipt shouldn't interrupt the user.
  }
}

export async function markAllNotificationsRead(token) {
  try {
    await apiConnector("POST", MARK_ALL_NOTIFICATIONS_READ_API, null, {
      Authorization: `Bearer ${token}`,
    })
  } catch (error) {
    // Silent
  }
}

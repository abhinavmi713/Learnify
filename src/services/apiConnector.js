import axios from "axios";

// Get base URL from environment
const BASE_URL = process.env.REACT_APP_BASE_URL;

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  // Sends and receives the httpOnly refresh-token cookie. Page scripts can never
  // read it; the server only accepts it on /api/v1/auth.
  withCredentials: true,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

export const apiConnector = (method, url, bodyData, headers, params) => {
  return axiosInstance({
    method: method,
    url: url,
    data: bodyData || null,
    headers: headers || {},
    params: params || null,
  });
};

// ---------------------------------------------------------------------------
// Silent session refresh.
//
// Access tokens live 15 minutes. When a request fails with 401, the client asks
// /auth/refresh for a new one (the refresh cookie rotates), then repeats the
// original request once with the new token. Concurrent 401s share one refresh.
// If refreshing fails the session is over and `onSessionEnded` logs out locally.
// ---------------------------------------------------------------------------
const REFRESH_URL = `${BASE_URL}/api/v1/auth/refresh`;
const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/signup", "/auth/sendotp", "/auth/reset-password"];

let session = { getToken: () => null, onToken: () => {}, onSessionEnded: () => {} };
let refreshing = null;

async function refreshAccessToken(staleToken) {
  try {
    const res = await axios.post(REFRESH_URL, null, {
      withCredentials: true,
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    session.onToken(res.data.token);
    return res.data.token;
  } catch (error) {
    // Another tab refreshed at the same moment; it stored the new token in
    // localStorage, which all tabs share.
    if (error?.response?.status === 409) {
      await new Promise((r) => setTimeout(r, 300));
      const latest = session.getToken();
      if (latest && latest !== staleToken) {
        session.onToken(latest);
        return latest;
      }
    }
    throw error;
  }
}

// One refresh at a time, shared by every caller.
export function refreshSession() {
  if (!refreshing) refreshing = refreshAccessToken(session.getToken()).finally(() => (refreshing = null));
  return refreshing;
}

export function installSessionHandling(handlers) {
  session = { ...session, ...handlers };
  axiosInstance.interceptors.response.use(undefined, async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    const auth = original?.headers?.get?.("Authorization") || original?.headers?.Authorization;
    if (status !== 401 || !original || original._retried || !auth || NO_REFRESH.some((p) => original.url?.includes(p))) {
      throw error;
    }
    original._retried = true;
    const stale = String(auth).replace("Bearer ", "");
    try {
      if (!refreshing) refreshing = refreshAccessToken(stale).finally(() => (refreshing = null));
      const token = await refreshing;
      original.headers.Authorization = `Bearer ${token}`;
      return axiosInstance(original);
    } catch (refreshError) {
      session.onSessionEnded();
      throw error;
    }
  });
}

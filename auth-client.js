const SESSION_KEY = "cinerune:session";
const REFRESH_SKEW_SECONDS = 60;

function normalizeApiBase() {
  let base = String(window.CINERUNE_CONFIG?.apiBase || "").trim();
  if (!base) return "";
  base = base.replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

export function buildApiUrl(path) {
  const base = normalizeApiBase();
  const origin = base || window.location.origin;
  return `${origin}/api${path}`;
}

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  if (!session) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isExpiring(session) {
  const expiresAt = Number(session?.expires_at || 0);
  if (!expiresAt) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds <= REFRESH_SKEW_SECONDS;
}

export async function ensureSession() {
  const session = getStoredSession();
  if (!session) return null;
  if (!isExpiring(session)) return session;

  try {
    const refreshed = await apiRequest("/auth/refresh", {
      method: "POST",
      body: { refresh_token: session.refresh_token }
    });
    if (refreshed?.access_token) {
      setStoredSession(refreshed);
      return refreshed;
    }
  } catch {
    // fall through
  }

  clearStoredSession();
  return null;
}

export async function apiRequest(path, options = {}) {
  const url = buildApiUrl(path);
  const headers = new Headers(options.headers || {});
  const body = options.body;
  if (body && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
  });

  const text = await response.text();
  const payload = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function authHeaders(session) {
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

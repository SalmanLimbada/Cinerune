import { initTmdb } from "./catalog.js?v=20260508-toggle1";

export const legacyProgressKey = "cinerune:progress";
export const progressBaseKey = "cinerune:progress";
export const bookmarksBaseKey = "cinerune:bookmarks";
export const notificationReadBaseKey = "cinerune:notification-read";

export function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

export function getProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${progressBaseKey}:user:${userId}` : `${progressBaseKey}:guest`;
}

export function getNotificationReadKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${notificationReadBaseKey}:user:${userId}` : `${notificationReadBaseKey}:guest`;
}

export function initConfiguredTmdb() {
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });
}

import { apiRequest, authHeaders } from "./auth-client.js";

const bookmarkSyncBaseKey = "cinerune:bookmarks-sync";

function getBookmarkSyncKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarkSyncBaseKey}:user:${userId}` : "";
}

export async function syncBookmarksWithCloud(session, localBookmarks = {}) {
  if (!session?.user) return localBookmarks || {};

  try {
    const syncStartedAt = Date.now();
    await pushBookmarksToCloud(session, getPendingLocalBookmarks(session, localBookmarks), { includeDeleted: false });
    const remote = await pullBookmarksFromCloud(session);
    const merged = mergeBookmarks(session, localBookmarks, remote, syncStartedAt);
    localStorage.setItem(getBookmarkSyncKey(session), String(syncStartedAt));
    return merged;
  } catch {
    return localBookmarks || {};
  }
}

function getPendingLocalBookmarks(session, bookmarks = {}) {
  const lastSyncAt = Number(localStorage.getItem(getBookmarkSyncKey(session)) || 0);
  const cutoff = lastSyncAt || Date.now() - 5 * 60 * 1000;
  return Object.fromEntries(Object.entries(bookmarks || {}).filter(([, entry]) => Number(entry?.updatedAt || 0) > cutoff));
}

export async function pushBookmarksToCloud(session, bookmarks = {}, options = {}) {
  if (!session?.user) return;
  const includeDeleted = options.includeDeleted === true;
  const rows = Object.values(bookmarks || {})
    .filter((entry) => (
      entry?.id
      && entry?.mediaType
      && entry?.status
      && (includeDeleted || entry.status !== "deleted")
    ))
    .slice(-240)
    .map((entry) => ({
      user_id: session.user.id,
      media_type: entry.mediaType === "tv" ? "tv" : "movie",
      content_id: Number(entry.id),
      status: entry.status === "deleted" ? "deleted" : normalizeStatus(entry.status),
      title: String(entry.title || "").slice(0, 240),
      poster: String(entry.poster || "").slice(0, 500),
      updated_at: new Date(Number(entry.updatedAt || Date.now())).toISOString()
    }));

  if (!rows.length) return;
  await apiRequest("/bookmarks/push", {
    method: "POST",
    headers: authHeaders(session),
    body: { rows }
  });
}

export async function deleteBookmarkFromCloud(session, mediaType, id) {
  if (!session?.user) return;
  await apiRequest("/bookmarks/delete", {
    method: "POST",
    headers: authHeaders(session),
    body: {
      media_type: mediaType === "tv" ? "tv" : "movie",
      content_id: Number(id)
    }
  });
}

async function pullBookmarksFromCloud(session) {
  const rows = await apiRequest("/bookmarks/pull?limit=500", {
    headers: authHeaders(session)
  });

  const bookmarks = {};
  (rows || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id || 0);
    if (!id) return;
    bookmarks[`${mediaType}:${id}`] = {
      id,
      mediaType,
      status: row.status === "deleted" ? "deleted" : normalizeStatus(row.status),
      title: row.title || "",
      poster: row.poster || "",
      updatedAt: Date.parse(row.updated_at || "") || Date.now()
    };
  });
  return bookmarks;
}

function mergeBookmarks(session, localBookmarks, remoteBookmarks, pulledAt = Date.now()) {
  const lastSyncAt = Number(localStorage.getItem(getBookmarkSyncKey(session)) || 0);
  const merged = {};

  Object.entries(remoteBookmarks || {}).forEach(([key, entry]) => {
    if (!entry || entry.status === "deleted") return;
    merged[key] = entry;
  });

  Object.entries(localBookmarks || {}).forEach(([key, entry]) => {
    if (!entry) return;
    if (entry.status === "deleted") return;
    const existing = merged[key];
    const localUpdatedAt = Number(entry.updatedAt || 0);
    const isNewLocalEdit = localUpdatedAt > pulledAt || (lastSyncAt && localUpdatedAt > lastSyncAt);
    if (isNewLocalEdit && (!existing || localUpdatedAt >= Number(existing.updatedAt || 0))) {
      merged[key] = entry;
    }
  });
  return merged;
}

function normalizeStatus(value) {
  return ["watching", "watched", "plan", "dropped"].includes(value) ? value : "watching";
}

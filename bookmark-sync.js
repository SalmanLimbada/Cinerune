import { apiRequest, authHeaders } from "./auth-client.js";

export async function syncBookmarksWithCloud(session, localBookmarks = {}) {
  if (!session?.user) return localBookmarks || {};

  try {
    const remote = await pullBookmarksFromCloud(session);
    const merged = mergeBookmarks(localBookmarks, remote);
    await pushBookmarksToCloud(session, merged);
    return merged;
  } catch {
    return localBookmarks || {};
  }
}

export async function pushBookmarksToCloud(session, bookmarks = {}) {
  if (!session?.user) return;
  const rows = Object.values(bookmarks || {})
    .filter((entry) => entry?.id && entry?.mediaType && entry?.status)
    .slice(-240)
    .map((entry) => ({
      user_id: session.user.id,
      media_type: entry.mediaType === "tv" ? "tv" : "movie",
      content_id: Number(entry.id),
      status: normalizeStatus(entry.status),
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
      status: normalizeStatus(row.status),
      title: row.title || "",
      poster: row.poster || "",
      updatedAt: Date.parse(row.updated_at || "") || Date.now()
    };
  });
  return bookmarks;
}

function mergeBookmarks(localBookmarks, remoteBookmarks) {
  const merged = { ...(remoteBookmarks || {}) };
  Object.entries(localBookmarks || {}).forEach(([key, entry]) => {
    if (!entry) return;
    const existing = merged[key];
    if (!existing || Number(entry.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
      merged[key] = entry;
    }
  });
  return merged;
}

function normalizeStatus(value) {
  return ["watching", "watched", "plan", "dropped"].includes(value) ? value : "watching";
}

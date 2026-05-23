import { apiRequest, authHeaders } from "./auth-client.js";

const deletedProgressBaseKey = "cinerune:progress-deleted";
const deletedProgressTtlMs = 24 * 60 * 60 * 1000;

export async function deleteProgressEntriesFromCloud(session, entries = []) {
  if (!session?.user) return;
  const rows = (entries || [])
    .map(normalizeProgressEntry)
    .filter(Boolean)
    .slice(0, 240);
  if (!rows.length) return;

  await apiRequest("/progress/delete", {
    method: "POST",
    headers: authHeaders(session),
    body: { entries: rows }
  });
}

export async function deleteProgressEntryFromCloud(session, entry) {
  return deleteProgressEntriesFromCloud(session, [entry]);
}

export function normalizeProgressEntry(entry) {
  if (!entry) return null;
  const mediaType = entry.mediaType || entry.media_type;
  const id = Number(entry.id ?? entry.content_id ?? 0);
  if (!id || (mediaType !== "movie" && mediaType !== "tv")) return null;
  return {
    media_type: mediaType,
    content_id: id,
    season_number: mediaType === "tv" ? Number(entry.season ?? entry.season_number ?? 1) || 1 : 1,
    episode_number: mediaType === "tv" ? Number(entry.episode ?? entry.episode_number ?? 1) || 1 : 1
  };
}

export function progressEntryKey(entry) {
  const normalized = normalizeProgressEntry(entry);
  if (!normalized) return "";
  return `${normalized.media_type}:${normalized.content_id}:${normalized.season_number}:${normalized.episode_number}`;
}

export function readDeletedProgressKeys(session) {
  return new Set(Object.keys(readDeletedProgressMap(session)));
}

export function readDeletedProgressMap(session) {
  const key = getDeletedProgressKey(session);
  const now = Date.now();
  let values = {};
  try {
    values = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    values = {};
  }

  let changed = false;
  Object.entries(values).forEach(([entryKey, deletedAt]) => {
    if (!entryKey || now - Number(deletedAt || 0) > deletedProgressTtlMs) {
      delete values[entryKey];
      changed = true;
    }
  });
  if (changed) {
    localStorage.setItem(key, JSON.stringify(values));
  }
  return values;
}

export function rememberDeletedProgressEntries(session, entries = []) {
  const storageKey = getDeletedProgressKey(session);
  const values = readDeletedProgressMap(session);
  let changed = false;
  (entries || []).forEach((entry) => {
    const key = progressEntryKey(entry);
    if (!key) return;
    values[key] = Date.now();
    changed = true;
  });
  if (changed) {
    localStorage.setItem(storageKey, JSON.stringify(values));
  }
}

export function forgetDeletedProgressEntry(session, entry) {
  const key = progressEntryKey(entry);
  if (!key) return;
  const storageKey = getDeletedProgressKey(session);
  const values = readDeletedProgressMap(session);
  if (!values[key]) return;
  delete values[key];
  localStorage.setItem(storageKey, JSON.stringify(values));
}

function getDeletedProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${deletedProgressBaseKey}:user:${userId}` : `${deletedProgressBaseKey}:guest`;
}

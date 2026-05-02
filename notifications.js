import { ensureSession } from "./auth-client.js";
import { initTmdb, fetchItemDetailsById } from "./catalog.js?v=20260502-browse2";

const progressBaseKey = "cinerune:progress";
const bookmarksBaseKey = "cinerune:bookmarks";
const notificationReadBaseKey = "cinerune:notification-read";

let catalogReady = false;

export async function initHeaderNotifications() {
  const wrap = document.getElementById("notificationsWrap");
  const button = document.getElementById("notificationsBtn");
  const badge = document.getElementById("notificationsBadge");
  const menu = document.getElementById("notificationsMenu");
  const list = document.getElementById("notificationsList");
  const markAll = document.getElementById("notificationsMarkAll");
  if (!wrap || !button || !badge || !menu || !list) return;

  setupCatalog();
  let session = null;
  try {
    session = await ensureSession();
  } catch {
    session = null;
  }

  const signedIn = Boolean(session?.user);
  wrap.toggleAttribute("hidden", !signedIn);
  if (!signedIn) return;

  const state = await loadNotificationState(session);
  renderNotifications(list, state, { compact: true });
  syncBadge(badge, markAll, state);

  button.addEventListener("click", () => {
    const hidden = menu.hasAttribute("hidden");
    closeAccountMenu();
    menu.toggleAttribute("hidden", !hidden);
    button.setAttribute("aria-expanded", hidden ? "true" : "false");
  });

  markAll?.addEventListener("click", () => {
    markAllRead(state, session);
    renderNotifications(list, state, { compact: true });
    syncBadge(badge, markAll, state);
  });

  list.addEventListener("click", (event) => {
    const readButton = event.target.closest(".notification-read-btn");
    if (readButton) {
      markRead(state, session, readButton.dataset.readId);
      renderNotifications(list, state, { compact: true });
      syncBadge(badge, markAll, state);
      return;
    }

    const link = event.target.closest(".notification-link");
    if (!link) return;
    const item = link.closest(".notification-item");
    markRead(state, session, item?.dataset.readId);
    saveReadIds(state, session);
  });

  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target)) {
      menu.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", "false");
    }
  });
}

export async function initInboxPage() {
  setupCatalog();
  const list = document.getElementById("inboxList");
  const status = document.getElementById("inboxStatus");
  const markAll = document.getElementById("inboxMarkAll");
  if (!list) return;

  let session = null;
  try {
    session = await ensureSession();
  } catch {
    session = null;
  }

  if (!session?.user) {
    if (status) status.textContent = "Sign in to see your inbox.";
    list.innerHTML = '<p class="notification-empty tiny muted">No inbox available while signed out.</p>';
    markAll?.setAttribute("hidden", "");
    return;
  }

  const state = await loadNotificationState(session);
  renderNotifications(list, state, { compact: false });
  updateInboxStatus(status, markAll, state);

  markAll?.addEventListener("click", () => {
    markAllRead(state, session);
    renderNotifications(list, state, { compact: false });
    updateInboxStatus(status, markAll, state);
  });

  list.addEventListener("click", (event) => {
    const readButton = event.target.closest(".notification-read-btn");
    if (!readButton) return;
    markRead(state, session, readButton.dataset.readId);
    renderNotifications(list, state, { compact: false });
    updateInboxStatus(status, markAll, state);
  });
}

async function loadNotificationState(session) {
  const bookmarks = readJson(getBookmarksKey(session), {});
  const progress = readJson(getProgressKey(session), {});
  const readIds = new Set(readJson(getNotificationReadKey(session), []));
  const watchedShows = Object.values(bookmarks || {})
    .filter((entry) => entry?.mediaType === "tv" && entry?.status === "watched")
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 16);

  const notifications = (await Promise.all(
    watchedShows.map((entry) => buildEpisodeNotification(entry, progress))
  )).filter(Boolean).sort((a, b) => Number(b.sortAt || 0) - Number(a.sortAt || 0));

  return { notifications, readIds };
}

async function buildEpisodeNotification(entry, progress) {
  const id = Number(entry?.id || 0);
  if (!id) return null;

  let item = null;
  try {
    item = await fetchItemDetailsById(id, "tv");
  } catch {
    return null;
  }

  const latestSeason = Number(item?.latestEpisodeSeason || 0);
  const latestEpisode = Number(item?.latestEpisodeNumber || 0);
  const latestAirDate = String(item?.latestEpisodeAirDate || "").trim();
  if (!latestSeason || !latestEpisode || !latestAirDate || !isReleasedDate(latestAirDate)) return null;

  const watched = getLatestWatchedEpisode(progress, id);
  if (!isEpisodeAfter(latestSeason, latestEpisode, watched.season, watched.episode)) return null;

  const notification = {
    id,
    title: item?.title || entry.title || `Title ${id}`,
    season: latestSeason,
    episode: latestEpisode,
    airDate: latestAirDate,
    episodeName: item?.latestEpisodeName || "",
    sortAt: Date.parse(latestAirDate) || Date.now(),
    href: buildWatchHref(id, latestSeason, latestEpisode)
  };
  notification.readId = buildNotificationReadId(notification);
  return notification;
}

function renderNotifications(container, state, options = {}) {
  const notifications = state.notifications || [];
  if (!notifications.length) {
    container.innerHTML = '<p class="notification-empty tiny muted">No new episodes right now.</p>';
    return;
  }

  container.innerHTML = notifications.map((item) => {
    const read = state.readIds.has(item.readId);
    return `
      <div class="notification-item${read ? " read" : ""}" data-read-id="${escapeHtml(item.readId)}">
        <a class="notification-link" href="${escapeHtml(item.href)}">
          <span class="notification-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(`New episode: S${item.season} E${item.episode}${item.episodeName ? ` - ${item.episodeName}` : ""}`)}</span>
          </span>
          <span class="notification-date">
            <span>${escapeHtml(formatTimeAgo(item.airDate))}</span>
            <span>${escapeHtml(formatShortDate(item.airDate))}</span>
          </span>
        </a>
        <button class="mini-action-btn notification-read-btn" type="button" data-read-id="${escapeHtml(item.readId)}">${read ? "Read" : "Read"}</button>
      </div>
    `;
  }).join("");

  container.classList.toggle("notifications-list-full", !options.compact);
}

function syncBadge(badge, markAll, state) {
  const unread = unreadCount(state);
  badge.textContent = String(unread);
  badge.toggleAttribute("hidden", unread < 1);
  markAll?.toggleAttribute("hidden", unread < 1);
}

function updateInboxStatus(status, markAll, state) {
  const total = state.notifications.length;
  const unread = unreadCount(state);
  if (status) status.textContent = total ? `${unread} unread of ${total} notification${total === 1 ? "" : "s"}.` : "No new episodes right now.";
  markAll?.toggleAttribute("hidden", unread < 1);
}

function unreadCount(state) {
  return state.notifications.filter((item) => !state.readIds.has(item.readId)).length;
}

function markRead(state, session, readId) {
  if (!readId) return;
  state.readIds.add(readId);
  saveReadIds(state, session);
}

function markAllRead(state, session) {
  state.notifications.forEach((item) => state.readIds.add(item.readId));
  saveReadIds(state, session);
}

function saveReadIds(state, session) {
  const values = [...state.readIds].slice(-200);
  state.readIds = new Set(values);
  localStorage.setItem(getNotificationReadKey(session), JSON.stringify(values));
}

function getLatestWatchedEpisode(progress, showId) {
  const entries = Object.values(progress || {})
    .filter((entry) => entry?.mediaType === "tv" && Number(entry.id) === Number(showId))
    .sort((a, b) => {
      const seasonDiff = Number(b.season || 1) - Number(a.season || 1);
      if (seasonDiff !== 0) return seasonDiff;
      const episodeDiff = Number(b.episode || 1) - Number(a.episode || 1);
      if (episodeDiff !== 0) return episodeDiff;
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });

  return entries.length
    ? { season: Number(entries[0].season || 1), episode: Number(entries[0].episode || 0) }
    : { season: 1, episode: 0 };
}

function setupCatalog() {
  if (catalogReady) return;
  catalogReady = true;
  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
    fallbackApiBase: String(window.CINERUNE_CONFIG?.fallbackApiBase || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });
}

function closeAccountMenu() {
  const accountMenu = document.getElementById("accountMenu");
  const accountBtn = document.getElementById("toggleAuth");
  accountMenu?.setAttribute("hidden", "");
  accountBtn?.classList.remove("active");
}

function buildWatchHref(id, season, episode) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", "tv");
  url.searchParams.set("s", String(season || 1));
  url.searchParams.set("e", String(episode || 1));
  return url.toString();
}

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

function getProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${progressBaseKey}:user:${userId}` : `${progressBaseKey}:guest`;
}

function getNotificationReadKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${notificationReadBaseKey}:user:${userId}` : `${notificationReadBaseKey}:guest`;
}

function buildNotificationReadId(item) {
  return `tv:${Number(item.id)}:${Number(item.season)}:${Number(item.episode)}:${String(item.airDate || "")}`;
}

function isEpisodeAfter(seasonA, episodeA, seasonB, episodeB) {
  if (Number(seasonA) !== Number(seasonB)) return Number(seasonA) > Number(seasonB);
  return Number(episodeA) > Number(episodeB);
}

function isReleasedDate(value) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 24 * 60 * 60 * 1000;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimeAgo(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const diffDays = Math.floor((Date.now() - time) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as catalogApi from "./catalog.js?v=20260427c";

const initTmdb = catalogApi.initTmdb;
const fetchHomeCatalog = catalogApi.fetchHomeCatalog;
const fetchGenreOptions = catalogApi.fetchGenreOptions || (async () => ({ movie: [], tv: [] }));
const fetchCountryOptions = catalogApi.fetchCountryOptions || (async () => []);
const searchCatalog = catalogApi.searchCatalog;
const titleById = catalogApi.titleById;
const posterById = catalogApi.posterById;
const fetchItemsByIds = catalogApi.fetchItemsByIds;
const fetchRecommendedFromHistory = catalogApi.fetchRecommendedFromHistory || (async () => []);
const fetchItemDetailsById = catalogApi.fetchItemDetailsById;

const legacyProgressKey = "cinerune:progress";
const progressBaseKey = "cinerune:progress";
const bookmarksBaseKey = "cinerune:bookmarks";
const homeCacheKey = "cinerune:home-cache";
const avatarOptions = [
  { id: "orbit", label: "Orbit", bg1: "#7ad8ff", bg2: "#1d4263", skin: "#f0c7a5", hair: "#1f2431", shirt: "#5ec7ff", eyes: "#172232", accent: "#d9f4ff", hairStyle: "short", accessory: "none" },
  { id: "ember", label: "Ember", bg1: "#ffb28c", bg2: "#5b2433", skin: "#d7a07f", hair: "#6e2e1f", shirt: "#ff8d6e", eyes: "#2c1b1b", accent: "#ffd4c8", hairStyle: "wave", accessory: "earring" },
  { id: "mint", label: "Mint", bg1: "#96f0cf", bg2: "#214f56", skin: "#f3d2bb", hair: "#275b52", shirt: "#7ce2c7", eyes: "#183137", accent: "#e5fff8", hairStyle: "bob", accessory: "none" },
  { id: "sun", label: "Sun", bg1: "#ffd86a", bg2: "#6a4c21", skin: "#c98d63", hair: "#6d4b1d", shirt: "#f7bf54", eyes: "#2a1a0f", accent: "#fff0b8", hairStyle: "curl", accessory: "glasses" },
  { id: "violet", label: "Violet", bg1: "#c8a7ff", bg2: "#37235d", skin: "#ecc1aa", hair: "#4b2b7f", shirt: "#9d79ff", eyes: "#21162f", accent: "#efe4ff", hairStyle: "long", accessory: "none" },
  { id: "rose", label: "Rose", bg1: "#ff9ed4", bg2: "#632b55", skin: "#f1cfb6", hair: "#8f3564", shirt: "#ff82c0", eyes: "#2d1830", accent: "#ffe0f0", hairStyle: "bun", accessory: "star" }
];

const el = {
  notificationsWrap: document.getElementById("notificationsWrap"),
  notificationsBtn: document.getElementById("notificationsBtn"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsMenu: document.getElementById("notificationsMenu"),
  notificationsList: document.getElementById("notificationsList"),
  toggleAuth: document.getElementById("toggleAuth"),
  accountMenuWrap: document.getElementById("accountMenuWrap"),
  accountMenu: document.getElementById("accountMenu"),
  openAccountSettings: document.getElementById("openAccountSettings"),
  signOutMenuBtn: document.getElementById("signOutMenuBtn"),
  authModal: document.getElementById("authModal"),
  authBackdrop: document.getElementById("authBackdrop"),
  closeAuth: document.getElementById("closeAuth"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  signedInHint: document.getElementById("signedInHint"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  signInBtn: document.getElementById("signInBtn"),
  signUpBtn: document.getElementById("signUpBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  authHint: document.getElementById("authHint"),
  authUserEmail: document.getElementById("authUserEmail"),
  authAvatarThumb: document.getElementById("authAvatarThumb"),
  authButtonLabel: document.getElementById("authButtonLabel"),
  accountAvatar: document.getElementById("accountAvatar"),
  continueWatchingLink: document.getElementById("continueWatchingLink"),
  avatarPicker: document.getElementById("avatarPicker"),
  signedInAvatarPicker: document.getElementById("signedInAvatarPicker"),
  heroSection: document.getElementById("heroSection"),
  heroType: document.getElementById("heroType"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("heroMeta"),
  heroDesc: document.getElementById("heroDesc"),
  heroWatchBtn: document.getElementById("heroWatchBtn"),
  showGenreExplorer: document.getElementById("showGenreExplorer"),
  showCountryExplorer: document.getElementById("showCountryExplorer"),
  megaMenuPanel: document.getElementById("megaMenuPanel"),
  megaMenuTitle: document.getElementById("megaMenuTitle"),
  megaMenuGrid: document.getElementById("megaMenuGrid"),
  continueSection: document.getElementById("continueSection"),
  continueGrid: document.getElementById("continueGrid"),
  recommendedGrid: document.getElementById("recommendedGrid"),
  trendingGrid: document.getElementById("trendingGrid"),
  popularGrid: document.getElementById("popularGrid"),
  searchInput: document.getElementById("searchInput"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  searchResultsSection: document.getElementById("searchResultsSection"),
  searchResultsGrid: document.getElementById("searchResultsGrid"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  progress: {},
  bookmarks: readJson(getBookmarksKey(null), {}),
  supabase: null,
  session: null,
  cloudEnabled: false,
  homeData: {
    hero: null,
    recommended: [],
    trending: [],
    popular: []
  },
  genreOptions: [],
  countryOptions: [],
  explorerMode: "genre",
  searchTerm: "",
  searchResults: [],
  notifications: [],
  autoSyncTimer: null,
  lastSyncAt: 0,
  heroRotationTimer: null
};

function getBookmarksKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${bookmarksBaseKey}:user:${userId}` : `${bookmarksBaseKey}:guest`;
}

function getProgressKey(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  return userId ? `${progressBaseKey}:user:${userId}` : `${progressBaseKey}:guest`;
}

let selectedAvatarId = readJson("cinerune:avatar-choice", "orbit");
let authModalMode = "login";
const startupQuery = new URLSearchParams(window.location.search);
const startupAuthMode = startupQuery.get("auth") || startupQuery.get("modal");
const startupMenu = startupQuery.get("menu");

boot();

async function boot() {
  bindEvents();
  syncProgressState();

  initTmdb({
    apiKey: String(window.CINERUNE_CONFIG?.tmdbApiKey || "").trim(),
    readAccessToken: String(window.CINERUNE_CONFIG?.tmdbReadAccessToken || "").trim(),
    language: String(window.CINERUNE_CONFIG?.tmdbLanguage || "en-US").trim()
  });

  await initAuth();
  await refreshHome();
  await hydrateContinueRow();

  if (startupAuthMode === "settings" && state.session?.user) {
    openAuthModal(true);
  } else if (startupAuthMode === "login") {
    openAuthModal(false);
  }

  if (startupMenu === "genre" || startupMenu === "country") {
    state.explorerMode = startupMenu;
    renderMegaMenu();
    openMegaMenu();
  }

  registerServiceWorker();
}

function bindEvents() {
  if (el.notificationsBtn) {
    el.notificationsBtn.addEventListener("click", () => {
      toggleNotificationsMenu();
    });
  }

  if (el.toggleAuth) {
    el.toggleAuth.addEventListener("click", () => {
      if (state.session?.user) {
        toggleAccountMenu();
      } else {
        openAuthModal();
      }
    });
  }

  if (el.closeAuth) {
    el.closeAuth.addEventListener("click", closeAuthModal);
  }
  if (el.authBackdrop) {
    el.authBackdrop.addEventListener("click", closeAuthModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAuthModal();
  });

  if (el.signInBtn) el.signInBtn.addEventListener("click", signIn);
  if (el.signUpBtn) el.signUpBtn.addEventListener("click", signUp);
  if (el.signOutBtn) el.signOutBtn.addEventListener("click", signOut);
  if (el.signOutMenuBtn) el.signOutMenuBtn.addEventListener("click", signOut);

  if (el.openAccountSettings) {
    el.openAccountSettings.addEventListener("click", () => {
      closeAccountMenu();
      openAuthModal(true);
    });
  }

  if (el.authIdentifier) {
    el.authIdentifier.addEventListener("keydown", onAuthEnter);
  }
  if (el.authPassword) {
    el.authPassword.addEventListener("keydown", onAuthEnter);
  }

  renderAvatarPickers();

  if (el.showGenreExplorer) {
    el.showGenreExplorer.addEventListener("click", () => {
      state.explorerMode = "genre";
      renderMegaMenu();
      openMegaMenu();
    });
  }
  if (el.showCountryExplorer) {
    el.showCountryExplorer.addEventListener("click", () => {
      state.explorerMode = "country";
      renderMegaMenu();
      openMegaMenu();
    });
  }

  if (el.searchInput) {
    el.searchInput.addEventListener("input", debounce(async () => {
      state.searchTerm = el.searchInput.value.trim();
      if (!state.searchTerm) {
        state.searchResults = [];
        hideSearchSuggestions();
        hideSearchResults();
        return;
      }

      try {
        const result = await searchCatalog(state.searchTerm);
        const merged = (result.all || [...result.movies, ...result.tv]).slice(0, 24);
        state.searchResults = merged;
        renderSearchResults(merged);
        renderSearchSuggestions(state.searchResults);
      } catch {
        hideSearchSuggestions();
        hideSearchResults();
      }
    }, 280));

    el.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!state.searchTerm) return;
      openSearchPage(state.searchTerm);
    });
  }

  document.addEventListener("click", (event) => {
    if (el.accountMenuWrap && !el.accountMenuWrap.contains(event.target)) {
      closeAccountMenu();
    }
    if (el.notificationsWrap && !el.notificationsWrap.contains(event.target)) {
      closeNotificationsMenu();
    }
    if (!el.searchInput || !el.searchSuggestions) return;
    if (event.target === el.searchInput || el.searchSuggestions.contains(event.target)) return;
    hideSearchSuggestions();
  });

  document.addEventListener("click", (event) => {
    if (!el.megaMenuPanel || el.megaMenuPanel.hasAttribute("hidden")) return;
    const target = event.target;
    const clickedToggle = el.showGenreExplorer?.contains(target) || el.showCountryExplorer?.contains(target);
    const clickedInsidePanel = el.megaMenuPanel.contains(target);
    if (!clickedToggle && !clickedInsidePanel) {
      closeMegaMenu();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === getProgressKey(state.session) && event.newValue) {
      try {
        state.progress = JSON.parse(event.newValue);
        hydrateContinueRow();
        refreshPersonalizedCollections();
        queueAutoSync();
      } catch {
        // ignore malformed storage values
      }
      return;
    }

    if (event.key === getBookmarksKey(state.session)) {
      state.bookmarks = readJson(getBookmarksKey(state.session), {});
      refreshPersonalizedCollections();
    }
  });
}

async function refreshHome() {
  const [homeResult, genresResult, countriesResult] = await Promise.allSettled([
    fetchHomeCatalog(),
    fetchGenreOptions(),
    fetchCountryOptions()
  ]);

  let homeData = null;
  if (homeResult.status === "fulfilled") {
    homeData = homeResult.value;
    localStorage.setItem(homeCacheKey, JSON.stringify(homeData));
  } else {
    homeData = readJson(homeCacheKey, null);
  }

  if (!homeData) {
    renderUnavailableState();
    return;
  }

  state.homeData.hero = homeData.hero || null;
  state.homeData.recommended = await buildRecommendedRow(homeData);
  state.homeData.trending = homeData.trending || [];
  state.homeData.popular = homeData.popular || [];

  const genreData = genresResult.status === "fulfilled" ? genresResult.value : { movie: [], tv: [] };
  state.genreOptions = dedupeExplorerOptions([...(genreData.movie || []), ...(genreData.tv || [])], "id");
  state.countryOptions = countriesResult.status === "fulfilled" ? (countriesResult.value || []) : [];

  renderHero();
  renderRecommended();
  renderTrending();
  renderPopular();
  renderMegaMenu();
  await refreshNotifications();
  startHeroRotation();
}

function renderUnavailableState() {
  if (!el.heroType || !el.heroTitle || !el.heroMeta || !el.heroDesc || !el.heroSection || !el.heroWatchBtn) return;
  el.heroType.textContent = "Featured";
  el.heroTitle.textContent = "Content unavailable";
  el.heroMeta.textContent = "Please refresh in a moment";
  el.heroDesc.textContent = "We are having trouble loading this page right now.";
  el.heroSection.style.background = "linear-gradient(90deg, rgba(7,15,31,0.9), rgba(7,15,31,0.6))";
  el.heroWatchBtn.onclick = null;

  el.recommendedGrid.innerHTML = "";
  el.trendingGrid.innerHTML = "";
  if (el.popularGrid) el.popularGrid.innerHTML = "";
  if (el.megaMenuGrid) el.megaMenuGrid.innerHTML = "";
}

function renderHero() {
  const item = state.homeData.hero;
  if (!item) return;

  el.heroType.textContent = item.mediaType === "movie" ? "Featured Movie" : "Featured Series";
  el.heroTitle.textContent = item.title;
  el.heroMeta.textContent = [item.year, item.genre || (item.mediaType === "movie" ? "Movie" : "TV Series")]
    .filter(Boolean)
    .join(" | ");
  el.heroDesc.textContent = item.plot || "No overview available.";

  const backdrop = item.backdrop || item.poster;
  el.heroSection.style.background = `linear-gradient(90deg, rgba(7,15,31,0.9), rgba(7,15,31,0.45)), url('${backdrop}') center/cover no-repeat`;

  el.heroWatchBtn.onclick = () => {
    openWatchPage(item.id, item.mediaType, 1, 1);
  };
}

function startHeroRotation() {
  if (state.heroRotationTimer) {
    clearInterval(state.heroRotationTimer);
    state.heroRotationTimer = null;
  }

  const pool = dedupeById([
    state.homeData.hero,
    ...(state.homeData.recommended || []).slice(0, 8),
    ...(state.homeData.trending || []).slice(0, 8)
  ].filter(Boolean));

  if (pool.length < 2) return;

  state.heroRotationTimer = window.setInterval(() => {
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;
    state.homeData.hero = next;
    renderHero();
  }, 12000);
}

function renderRecommended() {
  if (!el.recommendedGrid) return;
  renderPosterCards(el.recommendedGrid, (state.homeData.recommended || []).slice(0, 24));
}

function renderTrending() {
  if (!el.trendingGrid) return;
  renderPosterCards(el.trendingGrid, (state.homeData.trending || []).slice(0, 24));
}

function renderPopular() {
  if (!el.popularGrid) return;
  renderPosterCards(el.popularGrid, (state.homeData.popular || []).slice(0, 24));
}

function renderMegaMenu() {
  if (!el.megaMenuTitle || !el.megaMenuGrid) return;
  const isGenre = state.explorerMode === "genre";
  const options = isGenre ? state.genreOptions : state.countryOptions;
  el.megaMenuTitle.textContent = isGenre ? "Genres" : "Countries";

  if (!options.length) {
    el.megaMenuGrid.innerHTML = "";
    return;
  }

  el.megaMenuGrid.innerHTML = options.map((entry) => {
    const value = isGenre ? entry.id : entry.code;
    const label = entry.name;
    return `
    <button class="mega-menu-item" type="button" data-mode="${state.explorerMode}" data-value="${escapeHtml(value)}" data-name="${escapeHtml(label)}">
      ${escapeHtml(label)}
    </button>
  `;
  }).join("");

  [...el.megaMenuGrid.querySelectorAll(".mega-menu-item")].forEach((node) => {
    node.addEventListener("click", () => {
      openBrowsePage(node.dataset.mode, node.dataset.value, node.dataset.name);
      closeMegaMenu();
    });
  });
}

async function hydrateContinueRow() {
  const entries = Object.values(state.progress)
    .filter((entry) => Number(entry.timestamp || 0) > 20 && Number(entry.progress || 0) < 98)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 14);

  updateContinueWatchingLink(entries[0] || null);

  if (!entries.length) {
    el.continueSection.setAttribute("hidden", "");
    el.continueGrid.innerHTML = "";
    return;
  }

  const apiItems = await fetchItemsByIds(entries);
  const byKey = new Map(apiItems.map((item) => [`${item.mediaType}:${item.id}`, item]));

  const items = entries.map((entry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    const apiItem = byKey.get(key);
    return {
      id: entry.id,
      mediaType: entry.mediaType,
      title: apiItem?.title || entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
      poster: apiItem?.poster || entry.poster || posterById(entry.id, entry.mediaType) || "",
      year: apiItem?.year || "",
      progressMeta: entry.mediaType === "tv"
        ? `S${entry.season || 1} E${entry.episode || 1} • ${formatSeconds(entry.timestamp)}`
        : `${Math.round(Number(entry.progress || 0))}% • ${formatSeconds(entry.timestamp)}`
    };
  });

  el.continueSection.removeAttribute("hidden");
  renderPosterCards(el.continueGrid, items, { showProgressMeta: true, rowMode: true });
}

function renderPosterCards(container, items, options = {}) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    if (!item?.poster) return;

    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");

    image.src = item.poster;
    image.alt = `${item.title} poster`;
    title.textContent = item.title;

    if (options.showProgressMeta && item.progressMeta) {
      sub.textContent = item.progressMeta;
    } else {
      const typeLabel = item.mediaType === "movie" ? "Movie" : "TV";
      sub.textContent = [typeLabel, item.year].filter(Boolean).join(" | ");
    }

    button.addEventListener("click", () => {
      openWatchPage(item.id, item.mediaType, item.defaultSeason || 1, item.defaultEpisode || 1);
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

async function buildRecommendedRow(homeData) {
  const historyEntries = collectRecommendationHistory();
  if (!historyEntries.length) {
    return (homeData.recommended || []).slice(0, 24);
  }

  try {
    const personalized = await fetchRecommendedFromHistory(historyEntries, 24);
    if (personalized.length) {
      return personalized;
    }
  } catch {
    // fall back to non-personalized home data
  }

  return (homeData.recommended || []).slice(0, 24);
}

function collectRecommendationHistory() {
  const progressEntries = Object.values(state.progress || {})
    .filter((entry) => Number(entry.progress || 0) > 10 || Number(entry.timestamp || 0) > 300)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  const bookmarkEntries = Object.values(state.bookmarks || {})
    .filter((entry) => entry?.status === "watching" || entry?.status === "watched")
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

  return [...progressEntries, ...bookmarkEntries];
}

async function refreshPersonalizedCollections() {
  state.homeData.recommended = await buildRecommendedRow(state.homeData);
  renderRecommended();
  await refreshNotifications();
}

async function refreshNotifications() {
  if (!state.session?.user) {
    state.notifications = [];
    renderNotifications();
    return;
  }

  const watchingShows = Object.values(state.bookmarks || {})
    .filter((entry) => entry?.mediaType === "tv" && entry?.status === "watching")
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 16);

  const notifications = (await Promise.all(watchingShows.map(buildEpisodeNotification))).filter(Boolean);
  state.notifications = notifications.sort((a, b) => Number(b.sortAt || 0) - Number(a.sortAt || 0));
  renderNotifications();
}

async function buildEpisodeNotification(entry) {
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
  if (!latestSeason || !latestEpisode || !latestAirDate || !isReleasedDate(latestAirDate)) {
    return null;
  }

  const watched = getLatestWatchedEpisode(id);
  if (!isEpisodeAfter(latestSeason, latestEpisode, watched.season, watched.episode)) {
    return null;
  }

  return {
    id,
    mediaType: "tv",
    title: item?.title || entry.title || `Title ${id}`,
    poster: item?.poster || entry.poster || "",
    season: latestSeason,
    episode: latestEpisode,
    airDate: latestAirDate,
    episodeName: item?.latestEpisodeName || "",
    sortAt: Date.parse(latestAirDate) || Date.now(),
    message: `${item?.title || entry.title || "This show"} has a new episode available.`,
    href: buildWatchHref(id, "tv", latestSeason, latestEpisode)
  };
}

function getLatestWatchedEpisode(showId) {
  const entries = Object.values(state.progress || {})
    .filter((entry) => entry?.mediaType === "tv" && Number(entry.id) === Number(showId))
    .sort((a, b) => {
      const seasonDiff = Number(b.season || 1) - Number(a.season || 1);
      if (seasonDiff !== 0) return seasonDiff;
      const episodeDiff = Number(b.episode || 1) - Number(a.episode || 1);
      if (episodeDiff !== 0) return episodeDiff;
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });

  if (!entries.length) {
    return { season: 1, episode: 0 };
  }

  return {
    season: Number(entries[0].season || 1),
    episode: Number(entries[0].episode || 0)
  };
}

function renderNotifications() {
  const signedIn = Boolean(state.session?.user);
  if (el.notificationsWrap) {
    el.notificationsWrap.toggleAttribute("hidden", !signedIn);
  }

  if (!signedIn || !el.notificationsList || !el.notificationsBadge || !el.notificationsBtn) {
    return;
  }

  const notifications = state.notifications || [];
  const count = notifications.length;
  el.notificationsBadge.textContent = String(count);
  el.notificationsBadge.toggleAttribute("hidden", count < 1);

  if (!count) {
    el.notificationsList.innerHTML = '<p class="notification-empty tiny muted">No new episodes right now.</p>';
    return;
  }

  el.notificationsList.innerHTML = notifications.map((item) => `
    <a class="notification-item" href="${escapeHtml(item.href)}" data-id="${item.id}" data-season="${item.season}" data-episode="${item.episode}">
      <span class="notification-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(`New episode: S${item.season} E${item.episode}${item.episodeName ? ` - ${item.episodeName}` : ""}`)}</span>
      </span>
      <span class="notification-date">${escapeHtml(formatShortDate(item.airDate))}</span>
    </a>
  `).join("");

  [...el.notificationsList.querySelectorAll(".notification-item")].forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      closeNotificationsMenu();
      openWatchPage(Number(node.dataset.id), "tv", Number(node.dataset.season), Number(node.dataset.episode));
    });
  });
}

function toggleNotificationsMenu() {
  if (!el.notificationsMenu || !state.session?.user) return;
  const hidden = el.notificationsMenu.hasAttribute("hidden");
  closeAccountMenu();
  if (hidden) {
    el.notificationsMenu.removeAttribute("hidden");
    el.notificationsBtn?.setAttribute("aria-expanded", "true");
  } else {
    closeNotificationsMenu();
  }
}

function closeNotificationsMenu() {
  if (!el.notificationsMenu) return;
  el.notificationsMenu.setAttribute("hidden", "");
  el.notificationsBtn?.setAttribute("aria-expanded", "false");
}

function openSearchPage(term) {
  const text = String(term || "").trim();
  if (!text) return;
  const url = new URL("./search.html", window.location.href);
  url.searchParams.set("q", text);
  window.location.href = url.toString();
}

function openWatchPage(id, mediaType, season, episode) {
  window.location.href = buildWatchHref(id, mediaType, season, episode);
}

function updateContinueWatchingLink(entry) {
  if (!el.continueWatchingLink) return;

  if (!entry?.id) {
    el.continueWatchingLink.href = "./index.html#continueSection";
    return;
  }

  el.continueWatchingLink.href = buildWatchHref(entry.id, entry.mediaType, entry.season || 1, entry.episode || 1);
}

function buildWatchHref(id, mediaType, season, episode) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", String(season || 1));
    url.searchParams.set("e", String(episode || 1));
  }
  return url.toString();
}

function syncBookmarksState() {
  state.bookmarks = readJson(getBookmarksKey(state.session), {});
}

function syncProgressState() {
  const activeKey = getProgressKey(state.session);
  let progress = readJson(activeKey, null);

  if (!progress && !state.session?.user) {
    const legacy = readJson(legacyProgressKey, null);
    if (legacy && typeof legacy === "object") {
      progress = legacy;
      localStorage.setItem(activeKey, JSON.stringify(legacy));
    }
  }

  state.progress = progress && typeof progress === "object" ? progress : {};
}

async function initAuth() {
  const config = window.CINERUNE_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabasePublishableKey = String(config.supabasePublishableKey || config.supabaseAnonKey || "").trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    setAuthHint("Sign in is currently unavailable.");
    renderAuthUI();
    return;
  }

  try {
    state.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data } = await state.supabase.auth.getSession();
    state.session = data?.session || null;
    syncProgressState();
    syncBookmarksState();
    state.cloudEnabled = true;

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      syncProgressState();
      syncBookmarksState();
      renderAuthUI();
      if (session?.user) {
        const accountAvatarId = normalizeAvatarId(session.user.user_metadata?.avatarId || selectedAvatarId);
        if (session.user.user_metadata?.avatarId !== accountAvatarId) {
          persistAvatarChoice(accountAvatarId);
        }
      }
      if (session?.user) {
        pullCloudProgress();
        queueAutoSync(true);
      } else {
        refreshPersonalizedCollections();
        hydrateContinueRow();
      }
    });

    renderAuthUI();
    renderNotifications();
    if (state.session?.user) {
      await pullCloudProgress();
    }
  } catch {
    setAuthHint("Sign in is currently unavailable.");
  }
}

function renderAuthUI() {
  const signedIn = Boolean(state.session?.user);
  const settingsMode = authModalMode === "settings";
  if (settingsMode && signedIn) {
    el.signedOutView.setAttribute("hidden", "");
    el.signedInView.removeAttribute("hidden");
  } else {
    el.signedOutView.toggleAttribute("hidden", signedIn);
    el.signedInView.toggleAttribute("hidden", !signedIn);
  }

  if (signedIn) {
    const user = state.session.user;
    el.authUserEmail.textContent = user.user_metadata?.username || user.email || user.id;
    const avatarId = normalizeAvatarId(user.user_metadata?.avatarId || selectedAvatarId);
    selectedAvatarId = avatarId;
    renderAvatarPickers();
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Account");
    if (el.toggleAuth) el.toggleAuth.title = "Open account menu";
    const authTitle = el.authModal?.querySelector("#authTitle");
    if (settingsMode) {
      const signedInProfile = el.signedInView.querySelector(".signed-in-profile");
      const signedInHint = el.signedInView.querySelector("#signedInHint");
      if (signedInProfile) signedInProfile.setAttribute("hidden", "");
      if (signedInHint) signedInHint.setAttribute("hidden", "");
      if (authTitle) authTitle.textContent = "Settings";
      setAuthHint("");
    } else {
      const signedInProfile = el.signedInView.querySelector(".signed-in-profile");
      const signedInHint = el.signedInView.querySelector("#signedInHint");
      if (signedInProfile) signedInProfile.removeAttribute("hidden");
      if (signedInHint) signedInHint.removeAttribute("hidden");
      if (authTitle) authTitle.textContent = "Welcome Back";
      setAuthHint("Welcome back.");
    }
    el.signedInHint.textContent = "You are signed in.";
  } else {
    const avatarId = normalizeAvatarId(selectedAvatarId);
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Login");
    closeAccountMenu();
    if (el.toggleAuth) el.toggleAuth.title = "Sign in";
    setAuthHint("Sign in to save your lists.");
  }

  if (signedIn) {
    el.authIdentifier.value = "";
    el.authPassword.value = "";
  }

  renderNotifications();
}

async function signIn() {
  if (!state.supabase) return;

  const identifier = String(el.authIdentifier.value || "").trim().toLowerCase();
  const password = String(el.authPassword.value || "");
  if (!identifier || !password) {
    setAuthHint("Enter username/email and password.");
    return;
  }

  const email = identifier.includes("@") ? identifier : `${identifier}@cinerune.user`;
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthHint(`Sign in failed: ${error.message}`);
    return;
  }

  await persistAvatarChoice(selectedAvatarId);
  setAuthHint("Signed in.");
  closeAuthModal();
}

async function signUp() {
  if (!state.supabase) return;

  const identifier = String(el.authIdentifier.value || "").trim().toLowerCase();
  const password = String(el.authPassword.value || "");
  if (!identifier || password.length < 6) {
    setAuthHint("Provide username/email and password (6+ chars).");
    return;
  }

  const isEmail = identifier.includes("@");
  const email = isEmail ? identifier : `${identifier}@cinerune.user`;

  const payload = {
    email,
    password,
    options: isEmail ? { data: { avatarId: normalizeAvatarId(selectedAvatarId) } } : { data: { username: identifier, avatarId: normalizeAvatarId(selectedAvatarId) } }
  };

  const { error } = await state.supabase.auth.signUp(payload);
  if (error) {
    setAuthHint(`Sign up failed: ${error.message}`);
    return;
  }

  setAuthHint("Account created. If email confirmations are enabled, verify and sign in.");
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  setAuthHint("Signed out.");
}

function onAuthEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  signIn();
}

function normalizeAvatarId(value) {
  const fallback = avatarOptions[0]?.id || "orbit";
  return avatarOptions.some((option) => option.id === value) ? value : fallback;
}

function renderAvatarPickers() {
  const containers = [el.avatarPicker, el.signedInAvatarPicker].filter(Boolean);
  if (!containers.length) return;

  const activeId = normalizeAvatarId(selectedAvatarId);
  containers.forEach((container) => {
    container.innerHTML = avatarOptions.map((avatar) => `
      <button class="avatar-option${avatar.id === activeId ? " active" : ""}" type="button" data-avatar="${avatar.id}" aria-label="Select ${avatar.label} avatar">
        <img class="avatar-preview" src="${avatarDataUri(avatar)}" alt="" aria-hidden="true" />
        <span>${avatar.label}</span>
      </button>
    `).join("");

    [...container.querySelectorAll(".avatar-option")].forEach((node) => {
      node.addEventListener("click", async () => {
        selectedAvatarId = normalizeAvatarId(node.dataset.avatar);
        localStorage.setItem("cinerune:avatar-choice", JSON.stringify(selectedAvatarId));
        renderAvatarPickers();
        renderActiveAvatar(selectedAvatarId);
        await persistAvatarChoice(selectedAvatarId);
      });
    });
  });
}

function renderActiveAvatar(avatarId) {
  if (!el.accountAvatar) return;
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(avatarId)) || avatarOptions[0];
  el.accountAvatar.src = avatarDataUri(avatar);
  el.accountAvatar.alt = `${avatar.label} avatar`;
}

function renderAccountButton(avatarId, label) {
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(avatarId)) || avatarOptions[0];
  if (el.authAvatarThumb) {
    el.authAvatarThumb.src = avatarDataUri(avatar);
    el.authAvatarThumb.alt = `${avatar.label} avatar`;
  }
  if (el.authButtonLabel) {
    el.authButtonLabel.textContent = label;
  }
}

function avatarDataUri(avatar) {
  const safeLabel = escapeHtml(avatar.label);
  const safeBg1 = escapeHtml(avatar.bg1);
  const safeBg2 = escapeHtml(avatar.bg2);
  const safeSkin = escapeHtml(avatar.skin);
  const safeHair = escapeHtml(avatar.hair);
  const safeShirt = escapeHtml(avatar.shirt);
  const safeEyes = escapeHtml(avatar.eyes);
  const safeAccent = escapeHtml(avatar.accent);
  const hair = avatarHairSvg(avatar.hairStyle, safeHair);
  const accessory = avatarAccessorySvg(avatar.accessory, safeAccent, safeEyes);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${safeBg1}" stop-opacity="1" />
          <stop offset="100%" stop-color="#0b1425" stop-opacity="1" />
        </linearGradient>
        <linearGradient id="g2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${safeBg1}" stop-opacity="1" />
          <stop offset="100%" stop-color="${safeBg2}" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#g2)" />
      <circle cx="104" cy="22" r="14" fill="rgba(255,255,255,0.1)" />
      <circle cx="28" cy="104" r="20" fill="rgba(255,255,255,0.06)" />
      <path d="M24 118c6-22 22-34 40-34s34 12 40 34" fill="${safeShirt}" opacity="0.95" />
      <path d="M34 118c7-18 18-28 30-28s23 10 30 28" fill="rgba(255,255,255,0.14)" />
      <ellipse cx="64" cy="56" rx="24" ry="28" fill="${safeSkin}" />
      ${hair}
      <circle cx="55" cy="56" r="2.8" fill="${safeEyes}" />
      <circle cx="73" cy="56" r="2.8" fill="${safeEyes}" />
      <path d="M58 68c3 3 9 3 12 0" stroke="${safeEyes}" stroke-width="3" stroke-linecap="round" fill="none" />
      <path d="M48 49c3-2 6-3 10-3" stroke="${safeEyes}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7" />
      <path d="M70 46c4 0 7 1 10 3" stroke="${safeEyes}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7" />
      ${accessory}
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarHairSvg(style, color) {
  if (style === "wave") {
    return `<path d="M40 50c2-18 18-28 31-28 14 0 23 7 26 24-5-5-10-6-14-6-3 0-7 1-11 4-3-4-8-6-14-6-8 0-14 4-18 12z" fill="${color}" />`;
  }
  if (style === "bob") {
    return `<path d="M38 50c1-19 14-30 28-30 16 0 29 11 30 30-5-5-9-7-14-7-6 0-10 3-13 6-4-4-9-6-14-6-6 0-11 2-17 7z" fill="${color}" /><path d="M41 60c-1 14 2 23 8 29l-7 3c-6-8-9-18-8-32zM87 60c1 14-2 23-8 29l7 3c6-8 9-18 8-32z" fill="${color}" />`;
  }
  if (style === "curl") {
    return `<path d="M41 48c3-16 17-26 31-26s27 8 29 24c-4-3-7-5-11-5-3 0-6 1-9 3-3-5-7-8-14-8-6 0-10 2-14 7-4-3-7-4-11-4-4 0-7 2-11 9z" fill="${color}" /><circle cx="44" cy="42" r="7" fill="${color}" /><circle cx="84" cy="39" r="8" fill="${color}" />`;
  }
  if (style === "long") {
    return `<path d="M40 49c2-18 17-29 31-29 16 0 29 11 30 31-4-4-9-7-15-7-6 0-11 2-16 6-4-4-9-6-15-6-5 0-10 2-15 5z" fill="${color}" /><path d="M43 58c-2 14 0 27 5 36h10c-5-9-7-22-6-36zM85 58c2 14 0 27-5 36H70c5-9 7-22 6-36z" fill="${color}" />`;
  }
  if (style === "bun") {
    return `<circle cx="79" cy="25" r="10" fill="${color}" /><path d="M40 50c2-17 15-29 31-29 14 0 27 10 29 28-5-4-9-6-14-6-6 0-11 2-15 6-4-4-8-6-15-6-5 0-10 2-16 7z" fill="${color}" />`;
  }
  return `<path d="M40 49c4-18 16-28 30-28 15 0 27 10 30 28-6-5-11-7-16-7-7 0-12 2-16 6-3-3-8-5-15-5-5 0-9 1-13 6z" fill="${color}" />`;
}

function avatarAccessorySvg(accessory, accent, eyes) {
  if (accessory === "earring") {
    return `<circle cx="84" cy="66" r="2.6" fill="${accent}" />`;
  }
  if (accessory === "glasses") {
    return `<rect x="47" y="51" width="14" height="10" rx="4" stroke="${eyes}" stroke-width="2" fill="none" /><rect x="67" y="51" width="14" height="10" rx="4" stroke="${eyes}" stroke-width="2" fill="none" /><path d="M61 56h6" stroke="${eyes}" stroke-width="2" />`;
  }
  if (accessory === "star") {
    return `<path d="M87 43l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="${accent}" />`;
  }
  return "";
}

async function persistAvatarChoice(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  selectedAvatarId = normalized;
  localStorage.setItem("cinerune:avatar-choice", JSON.stringify(normalized));

  if (!state.session?.user || !state.supabase) return;

  try {
    await state.supabase.auth.updateUser({ data: { avatarId: normalized } });
  } catch {
    // ignore avatar sync errors
  }
}

function toggleAccountMenu(forceOpen) {
  if (!el.accountMenu) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : el.accountMenu.hasAttribute("hidden");
  if (shouldOpen) {
    el.accountMenu.removeAttribute("hidden");
    el.toggleAuth?.classList.add("active");
  } else {
    closeAccountMenu();
  }
}

function closeAccountMenu() {
  if (!el.accountMenu) return;
  el.accountMenu.setAttribute("hidden", "");
  el.toggleAuth?.classList.remove("active");
}

function openAuthModal(_settingsMode = false) {
  if (!el.authModal) return;
  authModalMode = _settingsMode ? "settings" : "login";
  el.authModal.removeAttribute("hidden");
  renderAuthUI();
}

async function syncProgressToCloud() {
  if (!state.session?.user || !state.supabase) {
    return;
  }

  const rows = Object.values(state.progress).slice(-240).map((entry) => ({
    user_id: state.session.user.id,
    media_type: entry.mediaType,
    content_id: entry.id,
    season_number: entry.season || 1,
    episode_number: entry.episode || 1,
    timestamp_seconds: Math.floor(Number(entry.timestamp || 0)),
    duration_seconds: Math.floor(Number(entry.duration || 0)),
    progress_percent: Number(entry.progress || 0),
    updated_at: new Date(Number(entry.updatedAt || Date.now())).toISOString()
  }));

  if (!rows.length) {
    return;
  }

  const { error } = await state.supabase
    .from("watch_progress")
    .upsert(rows, { onConflict: "user_id,media_type,content_id,season_number,episode_number" });

  if (error) {
    setStatus("Could not save progress right now.");
    return;
  }

  state.lastSyncAt = Date.now();
}

async function pullCloudProgress() {
  if (!state.session?.user || !state.supabase) return;

  const { data, error } = await state.supabase
    .from("watch_progress")
    .select("media_type,content_id,season_number,episode_number,timestamp_seconds,duration_seconds,progress_percent,updated_at")
    .eq("user_id", state.session.user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    setStatus("Could not load saved progress.");
    return;
  }

  (data || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id);
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;

    state.progress[key] = {
      mediaType,
      id,
      season,
      episode,
      timestamp: Number(row.timestamp_seconds) || 0,
      duration: Number(row.duration_seconds) || 0,
      progress: Number(row.progress_percent) || 0,
      updatedAt: Date.parse(row.updated_at || "") || Date.now(),
      title: titleById(id, mediaType) || `Title ${id}`,
      poster: posterById(id, mediaType) || ""
    };
  });

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  await hydrateContinueRow();
  await refreshPersonalizedCollections();
  queueAutoSync(true);
}

function renderSearchSuggestions(items) {
  if (!el.searchSuggestions) return;
  const top = (items || []).slice(0, 8);
  if (!top.length) {
    hideSearchSuggestions();
    return;
  }

  el.searchSuggestions.innerHTML = top.map((item, index) => {
    const type = item.mediaType === "movie" ? "Movie" : "TV";
    const subtitle = [type, item.year]
      .filter(Boolean)
      .join(" | ");
    const poster = item.poster || "";
    return `
      <button class="search-suggestion" type="button" data-id="${item.id}" data-type="${item.mediaType}" style="animation-delay:${index * 35}ms">
        <img class="search-suggestion-poster" src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)} poster" loading="lazy" decoding="async" />
        <span>
          <span class="search-suggestion-title">${escapeHtml(item.title)}</span>
          <span class="search-suggestion-sub">${escapeHtml(subtitle)}</span>
        </span>
      </button>
    `;
  }).join("");

  [...el.searchSuggestions.querySelectorAll(".search-suggestion")].forEach((node) => {
    node.addEventListener("click", () => {
      openWatchPage(Number(node.dataset.id), node.dataset.type, 1, 1);
    });
  });

  el.searchSuggestions.removeAttribute("hidden");
}

function hideSearchSuggestions() {
  if (!el.searchSuggestions) return;
  el.searchSuggestions.setAttribute("hidden", "");
  el.searchSuggestions.innerHTML = "";
}

function renderSearchResults(items) {
  if (!el.searchResultsSection || !el.searchResultsGrid) return;
  const topResults = (items || []).slice(0, 16);
  if (!topResults.length) {
    hideSearchResults();
    return;
  }

  el.searchResultsSection.removeAttribute("hidden");
  renderPosterCards(el.searchResultsGrid, topResults);
}

function hideSearchResults() {
  if (!el.searchResultsSection || !el.searchResultsGrid) return;
  el.searchResultsSection.setAttribute("hidden", "");
  el.searchResultsGrid.innerHTML = "";
}

function queueAutoSync(immediate = false) {
  if (!state.session?.user || !state.supabase) return;

  const minGapMs = 15000;
  const elapsed = Date.now() - state.lastSyncAt;
  const delay = immediate ? 0 : Math.max(2000, minGapMs - elapsed);

  if (state.autoSyncTimer) {
    clearTimeout(state.autoSyncTimer);
  }

  state.autoSyncTimer = window.setTimeout(() => {
    state.autoSyncTimer = null;
    syncProgressToCloud();
  }, delay);
}

function setStatus(message) {
  void message;
}

function setAuthHint(message) {
  el.authHint.textContent = message;
}

function isReleasedDate(value) {
  if (!value) return false;
  const timestamp = Date.parse(`${value}T23:59:59Z`);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function isEpisodeAfter(seasonA, episodeA, seasonB, episodeB) {
  if (Number(seasonA) !== Number(seasonB)) return Number(seasonA) > Number(seasonB);
  return Number(episodeA) > Number(episodeB);
}

function formatShortDate(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(parsed));
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const host = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost"
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host.endsWith(".local")
    || /^\d+\.\d+\.\d+\.\d+$/.test(host);

  const isKnownProductionHost = host.endsWith("workers.dev") || host.endsWith("netlify.app");

  if (isLocalHost || !isKnownProductionHost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});

    if (window.caches?.keys) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (key.startsWith("cinerune-static-")) {
            caches.delete(key);
          }
        });
      }).catch(() => {});
    }

    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function cssEscape(value) {
  return String(value || "").replaceAll('"', '\\"');
}

function openBrowsePage(mode, value, name) {
  const url = new URL("./browse.html", window.location.href);
  url.searchParams.set("mode", mode === "country" ? "country" : "genre");
  url.searchParams.set("value", String(value || ""));
  if (name) url.searchParams.set("name", String(name));
  window.location.href = url.toString();
}

function dedupeExplorerOptions(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const value = String(item?.[key] || "");
    if (!value) return;
    if (!map.has(value)) map.set(value, item);
  });
  return [...map.values()];
}

function dedupeById(items) {
  const map = new Map();
  items.forEach((item) => {
    map.set(`${item.mediaType}:${item.id}`, item);
  });
  return [...map.values()];
}

function closeAuthModal() {
  if (!el.authModal) return;
  el.authModal.setAttribute("hidden", "");
}

function openMegaMenu() {
  if (!el.megaMenuPanel) return;
  el.megaMenuPanel.removeAttribute("hidden");
}

function closeMegaMenu() {
  if (!el.megaMenuPanel) return;
  el.megaMenuPanel.setAttribute("hidden", "");
}

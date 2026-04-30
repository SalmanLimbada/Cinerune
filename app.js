import { apiRequest, authHeaders, ensureSession, setStoredSession, clearStoredSession } from "./auth-client.js";
import * as catalogApi from "./catalog.js?v=20260430-search";

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
const isSensitiveCatalogItem = catalogApi.isSensitiveCatalogItem || (() => false);

const legacyProgressKey = "cinerune:progress";
const progressBaseKey = "cinerune:progress";
const bookmarksBaseKey = "cinerune:bookmarks";
const homeCacheKey = "cinerune:home-cache";
const INPUT_LIMITS = {
  identifierMax: 80,
  usernameMax: 24,
  passwordMax: 128,
  searchMax: 80
};
const avatarOptions = [
  { id: "ninja", label: "Ninja Boy", bg1: "#ff9900", bg2: "#d32f2f", skin: "#ffdfbd", hair: "#ffdd00", shirt: "#ff6600", eyes: "#3b5998", accent: "#003366", hairStyle: "spiky", accessory: "headband" },
  { id: "pirate", label: "Pirate King", bg1: "#4dabf7", bg2: "#1864ab", skin: "#f1c27d", hair: "#111111", shirt: "#e03131", eyes: "#111111", accent: "#f5c518", hairStyle: "short", accessory: "strawhat" },
  { id: "wizard", label: "Chosen Wizard", bg1: "#660000", bg2: "#220000", skin: "#ffe0c2", hair: "#2c1b18", shirt: "#333333", eyes: "#296d39", accent: "#ffd700", hairStyle: "short", accessory: "glasses_scar" },
  { id: "spider", label: "Web Slinger", bg1: "#e03131", bg2: "#0b7285", skin: "#f3d2bb", hair: "#4d331f", shirt: "#c92a2a", eyes: "#5c3a21", accent: "#1864ab", hairStyle: "short", accessory: "none" },
  { id: "jinx", label: "Chaos Girl", bg1: "#c8a7ff", bg2: "#862e9c", skin: "#fdf0f5", hair: "#22b8cf", shirt: "#212529", eyes: "#e64980", accent: "#333", hairStyle: "long", accessory: "none" },
  { id: "wednesday", label: "Goth Girl", bg1: "#495057", bg2: "#212529", skin: "#f8f9fa", hair: "#111", shirt: "#111", eyes: "#111", accent: "#fff", hairStyle: "long", accessory: "none" },
  { id: "chemist", label: "The Chemist", bg1: "#b2f2bb", bg2: "#08b361", skin: "#ffdfbd", hair: "#111", shirt: "#2f9e44", eyes: "#111", accent: "#a67c52", hairStyle: "bald", accessory: "glasses_goatee" },
  { id: "sailor", label: "Moon Princess", bg1: "#ffb8cb", bg2: "#c2255c", skin: "#ffe3e3", hair: "#ffd43b", shirt: "#f8f9fa", eyes: "#1c7ed6", accent: "#fcc419", hairStyle: "bun", accessory: "star" },
  { id: "sorcerer", label: "Blindfold Sorcerer", bg1: "#3b5bdb", bg2: "#1864ab", skin: "#f8f9fa", hair: "#e9ecef", shirt: "#111", eyes: "#666", accent: "#111", hairStyle: "spiky", accessory: "blindfold" },
  { id: "slayer", label: "Demon Hunter", bg1: "#b2f2bb", bg2: "#2b8a3e", skin: "#f1c27d", hair: "#8b0000", shirt: "#2b8a3e", eyes: "#8b0000", accent: "#f1c27d", hairStyle: "spiky", accessory: "earring" },
  { id: "spy", label: "Telepath Girl", bg1: "#ffc9c9", bg2: "#e64980", skin: "#ffe3e3", hair: "#ffb8cb", shirt: "#212529", eyes: "#2b8a3e", accent: "#111", hairStyle: "bob", accessory: "none" },
  { id: "saiyan", label: "Super Warrior", bg1: "#ffec99", bg2: "#e8590c", skin: "#f1c27d", hair: "#111", shirt: "#f08c00", eyes: "#111", accent: "#111", hairStyle: "spiky", accessory: "none" }
];

const el = {
  notificationsWrap: document.getElementById("notificationsWrap"),
  notificationsBtn: document.getElementById("notificationsBtn"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsMenu: document.getElementById("notificationsMenu"),
  notificationsList: document.getElementById("notificationsList"),
  homeListsLink: document.getElementById("homeListsLink"),
  toggleAuth: document.getElementById("toggleAuth"),
  accountMenuWrap: document.getElementById("accountMenuWrap"),
  accountMenu: document.getElementById("accountMenu"),
  openAccountSettings: document.getElementById("openAccountSettings"),
  signOutMenuBtn: document.getElementById("signOutMenuBtn"),
  authModal: document.getElementById("authModal"),
  authBackdrop: document.getElementById("authBackdrop"),
  closeAuth: document.getElementById("closeAuth"),
  loginTabBtn: document.getElementById("loginTabBtn"),
  signupTabBtn: document.getElementById("signupTabBtn"),
  authLoginView: document.getElementById("authLoginView"),
  authSignupView: document.getElementById("authSignupView"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  signedInHint: document.getElementById("signedInHint"),
  settingsUsername: document.getElementById("settingsUsername"),
  settingsPassword: document.getElementById("settingsPassword"),
  settingsPasswordConfirm: document.getElementById("settingsPasswordConfirm"),
  saveUsernameBtn: document.getElementById("saveUsernameBtn"),
  savePasswordBtn: document.getElementById("savePasswordBtn"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  signupUsername: document.getElementById("signupUsername"),
  signupPassword: document.getElementById("signupPassword"),
  signupConfirm: document.getElementById("signupConfirm"),
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
  searchSuggestions: document.getElementById("searchSuggestions"),
  navSearchBtn: document.getElementById("navSearchBtn"),
  navSearchInput: document.getElementById("navSearchInput"),
  navSearchForm: document.getElementById("navSearchForm"),
  searchResultsSection: document.getElementById("searchResultsSection"),
  searchResultsGrid: document.getElementById("searchResultsGrid"),
  searchPagination: document.getElementById("searchPagination"),
  posterCardTemplate: document.getElementById("posterCardTemplate")
};

const state = {
  progress: {},
  bookmarks: readJson(getBookmarksKey(null), {}),
  session: null,
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
  searchPage: 1,
  searchTotalPages: 1,
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

let selectedAvatarId = readJson("cinerune:avatar-choice", "ninja");
let authModalMode = "login";
const startupQuery = new URLSearchParams(window.location.search);
const startupAuthMode = startupQuery.get("auth") || startupQuery.get("modal");
const startupMenu = startupQuery.get("menu");

boot();

async function boot() {
  bindEvents();
  syncProgressState();

  initTmdb({
    apiBase: String(window.CINERUNE_CONFIG?.apiBase || "").trim(),
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
  if (el.saveUsernameBtn) el.saveUsernameBtn.addEventListener("click", saveUsername);
  if (el.savePasswordBtn) el.savePasswordBtn.addEventListener("click", savePassword);
  if (el.loginTabBtn) el.loginTabBtn.addEventListener("click", () => openAuthModal("login"));
  if (el.signupTabBtn) el.signupTabBtn.addEventListener("click", () => openAuthModal("signup"));

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
  [el.signupUsername, el.signupPassword, el.signupConfirm].forEach((input) => {
    if (input) input.addEventListener("keydown", onAuthEnter);
  });

  renderAvatarPickers();

  if (el.showGenreExplorer && el.showGenreExplorer.tagName === "BUTTON") {
    el.showGenreExplorer.addEventListener("click", () => {
      state.explorerMode = "genre";
      renderMegaMenu();
      openMegaMenu();
    });
  }
  if (el.showCountryExplorer && el.showCountryExplorer.tagName === "BUTTON") {
    el.showCountryExplorer.addEventListener("click", () => {
      state.explorerMode = "country";
      renderMegaMenu();
      openMegaMenu();
    });
  }

  if (el.navSearchInput) {
    el.navSearchInput.addEventListener("input", debounce(async () => {
      state.searchTerm = sanitizeText(el.navSearchInput.value, INPUT_LIMITS.searchMax);
      if (el.navSearchInput.value !== state.searchTerm) {
        el.navSearchInput.value = state.searchTerm;
      }
      if (!state.searchTerm) {
        state.searchResults = [];
        hideSearchSuggestions();
        hideSearchResults();
        return;
      }

      try {
        state.searchPage = 1;
        const result = await searchCatalog(state.searchTerm, { page: state.searchPage });
        const merged = (result.all || [...result.movies, ...result.tv]).slice(0, 24);
        state.searchResults = merged;
        state.searchTotalPages = Math.max(1, Number(result.totalPages || 1));
        renderSearchResults(merged);
        renderSearchPagination();
        renderSearchSuggestions(state.searchResults);
      } catch {
        hideSearchSuggestions();
        hideSearchResults();
      }
    }, 280));

    el.navSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const term = sanitizeText(el.navSearchInput.value, INPUT_LIMITS.searchMax);
        if (term) openSearchPage(term);
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (el.accountMenuWrap && !el.accountMenuWrap.contains(event.target)) {
      closeAccountMenu();
    }
    if (el.notificationsWrap && !el.notificationsWrap.contains(event.target)) {
      closeNotificationsMenu();
    }
    if (!el.navSearchInput || !el.searchSuggestions) return;
    if (event.target === el.navSearchInput || el.searchSuggestions.contains(event.target)) return;
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
  const entries = dedupeContinueEntries(Object.values(state.progress)
    .filter((entry) => Number(entry.timestamp || 0) > 20 && Number(entry.progress || 0) < 98))
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
      season: entry.season || 1,
      episode: entry.episode || 1,
      title: apiItem?.title || entry.title || titleById(entry.id, entry.mediaType) || `Title ${entry.id}`,
      poster: apiItem?.poster || entry.poster || posterById(entry.id, entry.mediaType) || "",
      year: apiItem?.year || "",
      progressKey: `${entry.mediaType}:${entry.id}:${entry.season || 1}:${entry.episode || 1}`,
      progressMeta: entry.mediaType === "tv"
        ? `S${entry.season || 1} E${entry.episode || 1} • ${formatSeconds(entry.timestamp)}`
        : `${Math.round(Number(entry.progress || 0))}% • ${formatSeconds(entry.timestamp)}`
    };
  }).filter((item) => !isSensitiveCatalogItem(item));

  if (!items.length) {
    el.continueSection.setAttribute("hidden", "");
    el.continueGrid.innerHTML = "";
    return;
  }

  el.continueSection.removeAttribute("hidden");
  renderPosterCards(el.continueGrid, items, {
    showProgressMeta: true,
    rowMode: true,
    allowContinueRemove: true,
    resumeOnClick: true
  });
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

    if (options.allowContinueRemove && item.progressKey) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "continue-remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${item.title} from Continue Watching`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeContinueEntry(item.progressKey);
      });
      node.appendChild(removeBtn);
    }

    button.addEventListener("click", () => {
      const resume = Boolean(options.resumeOnClick);
      const href = buildWatchHref(
        item.id,
        item.mediaType,
        item.season || item.defaultSeason || 1,
        item.episode || item.defaultEpisode || 1,
        resume
      );
      window.location.href = href;
    });

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function dedupeContinueEntries(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = `${entry.mediaType === "tv" ? "tv" : "movie"}:${Number(entry.id || 0)}`;
    const previous = map.get(key);
    if (!previous || Number(entry.updatedAt || 0) > Number(previous.updatedAt || 0)) {
      map.set(key, entry);
    }
  });
  return [...map.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function removeContinueEntry(progressEntryKey) {
  if (!progressEntryKey || !state.progress?.[progressEntryKey]) return;
  delete state.progress[progressEntryKey];
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  void hydrateContinueRow();
  void refreshPersonalizedCollections();
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
  const text = sanitizeText(term, INPUT_LIMITS.searchMax);
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
    el.continueWatchingLink.href = "./lists.html?view=continue";
    return;
  }

  el.continueWatchingLink.href = "./lists.html?view=continue";
}

function buildWatchHref(id, mediaType, season, episode, resume = false) {
  const url = new URL("./watch.html", window.location.href);
  url.searchParams.set("id", String(id));
  url.searchParams.set("type", mediaType === "tv" ? "tv" : "movie");
  if (mediaType === "tv") {
    url.searchParams.set("s", String(season || 1));
    url.searchParams.set("e", String(episode || 1));
  }
  if (resume) {
    url.searchParams.set("resume", "1");
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
  try {
    const session = await ensureSession();
    state.session = session;
    syncProgressState();
    syncBookmarksState();
    renderAuthUI();
    renderNotifications();
    if (state.session?.user) {
      await pullCloudProgress();
    } else {
      refreshPersonalizedCollections();
      hydrateContinueRow();
    }
  } catch {
    setAuthHint("Sign in is currently unavailable.");
    renderAuthUI();
  }
}

function renderAuthUI() {
  const signedIn = Boolean(state.session?.user);
  const settingsMode = authModalMode === "settings";
  const signupMode = authModalMode === "signup";
  const loginMode = authModalMode === "login";

  el.loginTabBtn?.classList.toggle("active", loginMode);
  el.signupTabBtn?.classList.toggle("active", signupMode);
  el.loginTabBtn?.toggleAttribute("hidden", signedIn || settingsMode);
  el.signupTabBtn?.toggleAttribute("hidden", signedIn || settingsMode);
  if (settingsMode && signedIn) {
    el.signedOutView.setAttribute("hidden", "");
    el.signedInView.removeAttribute("hidden");
  } else {
    el.signedOutView.toggleAttribute("hidden", signedIn);
    el.signedInView.toggleAttribute("hidden", !signedIn);
    el.authLoginView?.toggleAttribute("hidden", !loginMode);
    el.authSignupView?.toggleAttribute("hidden", !signupMode);
  }

  if (signedIn) {
    const user = state.session.user;
    el.authUserEmail.textContent = user.user_metadata?.username || user.email || user.id;
    const avatarId = normalizeAvatarId(user.user_metadata?.avatarId || selectedAvatarId);
    selectedAvatarId = avatarId;
    renderAvatarPickers();
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Account");
    el.homeListsLink?.removeAttribute("hidden");
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
      if (authTitle) authTitle.textContent = loginMode ? "Sign In" : "Create Account";
      setAuthHint("");
    }
    el.signedInHint.textContent = "You are signed in.";
    if (el.settingsUsername) {
      el.settingsUsername.value = user.user_metadata?.username || "";
    }
  } else {
    const avatarId = normalizeAvatarId(selectedAvatarId);
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Login");
    closeAccountMenu();
    el.homeListsLink?.setAttribute("hidden", "");
    if (el.toggleAuth) el.toggleAuth.title = "Sign in";
    if (el.settingsUsername) el.settingsUsername.value = "";
    if (el.settingsPassword) el.settingsPassword.value = "";
    if (el.settingsPasswordConfirm) el.settingsPasswordConfirm.value = "";
    setAuthHint("");
  }

  if (signedIn) {
    el.authIdentifier.value = "";
    el.authPassword.value = "";
  }

  renderNotifications();
}

async function signIn() {
  const identifier = normalizeIdentifier(el.authIdentifier.value);
  const password = String(el.authPassword.value || "");

  if (!identifier || !isValidPassword(password)) {
    setAuthHint("Enter a valid username/email and password.");
    return;
  }

  try {
    const session = await apiRequest("/auth/login", {
      method: "POST",
      body: { identifier, password }
    });
    if (!session?.access_token) {
      setAuthHint("Sign in failed. Try again.");
      return;
    }
    setStoredSession(session);
    state.session = session;
    syncProgressState();
    syncBookmarksState();
    await persistAvatarChoice(selectedAvatarId);
    renderAuthUI();
    await pullCloudProgress();
    setAuthHint("Signed in.");
    closeAuthModal();
  } catch (error) {
    setAuthHint(`Sign in failed: ${error.message}`);
  }
}

async function signUp() {
  const username = normalizeUsername(el.signupUsername.value);
  const password = String(el.signupPassword.value || "");
  const confirmPassword = String(el.signupConfirm.value || "");

  if (!username || !isValidPassword(password)) {
    setAuthHint("Provide a username and a password (6+ chars).");
    return;
  }
  if (password !== confirmPassword) {
    setAuthHint("Passwords do not match.");
    return;
  }

  try {
    await apiRequest("/auth/signup", {
      method: "POST",
      body: {
        username,
        password,
        avatarId: normalizeAvatarId(selectedAvatarId)
      }
    });
    setAuthHint("Account created. Sign in with your username and password.");
  } catch (error) {
    setAuthHint(`Sign up failed: ${error.message}`);
  }
}

async function signOut() {
  try {
    const session = await ensureSession();
    if (session?.access_token) {
      await apiRequest("/auth/logout", {
        method: "POST",
        headers: authHeaders(session)
      });
    }
  } catch {
    // ignore logout failures
  }

  clearStoredSession();
  state.session = null;
  syncProgressState();
  syncBookmarksState();
  renderAuthUI();
  refreshPersonalizedCollections();
  hydrateContinueRow();
  setAuthHint("Signed out.");
}

async function saveUsername() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }

  const username = normalizeUsername(el.settingsUsername?.value);
  if (!username) {
    setAuthHint("Provide a username with 3-24 letters, numbers, dots, underscores, or dashes.");
    return;
  }

  try {
    const session = await ensureSession();
    if (!session) {
      setAuthHint("Sign in again to update your username.");
      return;
    }
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: {
        username,
        avatarId: normalizeAvatarId(state.session.user.user_metadata?.avatarId || selectedAvatarId)
      }
    });
    applyUpdatedUser(updated?.user || updated, { username });
    setAuthHint("Username updated.");
  } catch (error) {
    setAuthHint(`Update failed: ${error.message}`);
  }
}

async function savePassword() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }

  const password = String(el.settingsPassword?.value || "");
  const confirm = String(el.settingsPasswordConfirm?.value || "");
  if (!isValidPassword(password)) {
    setAuthHint("Provide a password with 6-128 characters.");
    return;
  }
  if (password !== confirm) {
    setAuthHint("Passwords do not match.");
    return;
  }

  try {
    const session = await ensureSession();
    if (!session) {
      setAuthHint("Sign in again to update your password.");
      return;
    }
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: { password }
    });
    applyUpdatedUser(updated?.user || updated);
    if (el.settingsPassword) el.settingsPassword.value = "";
    if (el.settingsPasswordConfirm) el.settingsPasswordConfirm.value = "";
    setAuthHint("Password updated.");
  } catch (error) {
    setAuthHint(`Update failed: ${error.message}`);
  }
}

function applyUpdatedUser(user, metadataPatch = {}) {
  if (!state.session?.user) return;
  const nextUser = user?.id
    ? user
    : {
        ...state.session.user,
        user_metadata: {
          ...(state.session.user.user_metadata || {}),
          ...metadataPatch
        }
      };
  state.session = {
    ...state.session,
    user: {
      ...state.session.user,
      ...nextUser,
      user_metadata: {
        ...(state.session.user.user_metadata || {}),
        ...(nextUser.user_metadata || {}),
        ...metadataPatch
      }
    }
  };
  setStoredSession(state.session);
  renderAuthUI();
}

function onAuthEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (authModalMode === "signup") {
    signUp();
  } else {
    signIn();
  }
}

function sanitizeText(value, maxLen) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function normalizeIdentifier(value) {
  const trimmed = sanitizeText(value, INPUT_LIMITS.identifierMax).toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) {
    return /.+@.+\..+/.test(trimmed) ? trimmed : "";
  }
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function normalizeUsername(value) {
  const trimmed = sanitizeText(value, INPUT_LIMITS.usernameMax).toLowerCase();
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= INPUT_LIMITS.passwordMax;
}

function normalizeAvatarId(value) {
  const fallback = avatarOptions[0]?.id || "ninja";
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

  const backHair = avatarBackHairSvg(avatar.hairStyle, safeHair);
  const frontHair = avatarFrontHairSvg(avatar.hairStyle, safeHair);
  const accessory = avatarAccessorySvg(avatar.accessory, safeAccent, safeEyes);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="bg-${avatar.id}" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${safeBg1}" />
          <stop offset="100%" stop-color="${safeBg2}" />
        </linearGradient>
      </defs>

      <!-- Background Base -->
      <rect width="128" height="128" rx="32" fill="url(#bg-${avatar.id})" />

      <!-- Back Hair Layer -->
      ${backHair}

      <!-- Body / Shoulders -->
      <path d="M 24 128 C 24 96 104 96 104 128" fill="${safeShirt}" />
      <!-- Inner shirt collar detail -->
      <path d="M 44 128 C 44 104 84 104 84 128" fill="rgba(255,255,255,0.15)" />

      <!-- Neck -->
      <rect x="54" y="70" width="20" height="24" rx="8" fill="${safeSkin}" />
      <!-- Neck Drop Shadow -->
      <rect x="54" y="78" width="20" height="12" fill="rgba(0,0,0,0.1)" />

      <!-- Head Shape -->
      <rect x="36" y="28" width="56" height="60" rx="26" fill="${safeSkin}" />

      <!-- Front Hair Layer -->
      ${frontHair}

      <!-- Eyes -->
      <circle cx="50" cy="58" r="4" fill="${safeEyes}" />
      <circle cx="78" cy="58" r="4" fill="${safeEyes}" />

      <!-- Cute Blush -->
      <circle cx="42" cy="66" r="5" fill="#ff0000" opacity="0.12" />
      <circle cx="86" cy="66" r="5" fill="#ff0000" opacity="0.12" />

      <!-- Smile -->
      <path d="M 58 68 Q 64 74 70 68" stroke="${safeEyes}" stroke-width="3" stroke-linecap="round" fill="none" />

      ${accessory}
    </svg>`.replace(/\s+/g, ' ').trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarBackHairSvg(style, color) {
  if (style === "bald") return "";
  if (style === "spiky") {
    return `<path d="M 24 60 L 16 40 L 32 32 L 40 12 L 64 6 L 88 12 L 96 32 L 112 40 L 104 60 Z" fill="${color}" />`;
  }
  if (style === "long") {
    return `
      <rect x="32" y="40" width="64" height="60" rx="16" fill="${color}" />
      <path d="M 32 80 L 32 110 C 32 120 44 120 44 110 L 44 80 Z" fill="${color}" />
      <path d="M 96 80 L 96 110 C 96 120 84 120 84 110 L 84 80 Z" fill="${color}" />
    `;
  }
  if (style === "bun") {
    return `<circle cx="64" cy="18" r="14" fill="${color}" />`;
  }
  if (style === "bob") {
    return `<rect x="30" y="36" width="68" height="48" rx="20" fill="${color}" />`;
  }
  if (style === "curl") {
     return `
       <circle cx="34" cy="46" r="16" fill="${color}" />
       <circle cx="94" cy="46" r="16" fill="${color}" />
       <circle cx="44" cy="24" r="18" fill="${color}" />
       <circle cx="84" cy="24" r="18" fill="${color}" />
       <circle cx="64" cy="16" r="20" fill="${color}" />
     `;
  }
  return "";
}

function avatarFrontHairSvg(style, color) {
  if (style === "bald") return "";
  if (style === "spiky") {
    return `<path d="M 32 52 L 36 26 L 48 38 L 54 18 L 64 36 L 74 18 L 80 38 L 92 26 L 96 52 Z" fill="${color}" />`;
  }
  if (style === "short") {
    return `<path d="M 32 52 C 32 16 96 16 96 52 C 96 58 84 46 64 42 C 44 38 32 58 32 52 Z" fill="${color}" />`;
  }
  if (style === "wave") {
    return `
      <path d="M 34 52 Q 44 20 64 26 Q 84 20 94 52 Q 82 36 64 36 Q 46 36 34 52 Z" fill="${color}" />
      <path d="M 64 26 Q 74 12 90 28 Q 74 18 64 26 Z" fill="${color}" opacity="0.8" />
    `;
  }
  if (style === "bob") {
    return `
      <path d="M 36 48 C 36 20 92 20 92 48 Q 78 34 64 34 Q 50 34 36 48 Z" fill="${color}" />
      <path d="M 30 40 L 40 40 L 40 76 C 40 84 30 84 30 76 Z" fill="${color}" />
      <path d="M 98 40 L 88 40 L 88 76 C 88 84 98 84 98 76 Z" fill="${color}" />
    `;
  }
  if (style === "curl") {
    return `
      <circle cx="48" cy="34" r="12" fill="${color}" />
      <circle cx="64" cy="30" r="14" fill="${color}" />
      <circle cx="80" cy="34" r="12" fill="${color}" />
      <circle cx="38" cy="42" r="10" fill="${color}" />
      <circle cx="90" cy="42" r="10" fill="${color}" />
    `;
  }
  if (style === "long") {
    return `<path d="M 36 46 C 36 20 92 20 92 46 Q 78 34 64 34 Q 50 34 36 46 Z" fill="${color}" />`;
  }
  if (style === "bun") {
    return `<path d="M 36 44 C 36 20 92 20 92 44 Q 78 34 64 34 Q 50 34 36 44 Z" fill="${color}" />`;
  }
  return `<path d="M 32 52 C 32 16 96 16 96 52 C 96 58 84 46 64 42 C 44 38 32 58 32 52 Z" fill="${color}" />`;
}

function avatarAccessorySvg(accessory, accent, eyes) {
  if (accessory === "earring") {
    return `
      <circle cx="34" cy="64" r="4" fill="${accent}" />
      <circle cx="94" cy="64" r="4" fill="${accent}" />
    `;
  }
  if (accessory === "glasses") {
    return `
      <rect x="36" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <rect x="68" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <line x1="60" y1="57" x2="68" y2="57" stroke="${eyes}" stroke-width="3" />
    `;
  }
  if (accessory === "star") {
    return `<path d="M 82 32 L 84 38 L 90 38 L 85 42 L 87 48 L 82 44 L 77 48 L 79 42 L 74 38 L 80 38 Z" fill="${accent}" />`;
  }
  if (accessory === "headband") {
    return `
      <rect x="36" y="36" width="56" height="12" fill="${accent}" />
      <rect x="52" y="38" width="24" height="8" rx="2" fill="#ddd" />
      <circle cx="56" cy="42" r="2" fill="#444" />
      <circle cx="72" cy="42" r="2" fill="#444" />
    `;
  }
  if (accessory === "strawhat") {
    return `
      <ellipse cx="64" cy="32" rx="46" ry="12" fill="${accent}" />
      <path d="M 42 30 C 42 8 86 8 86 30 Z" fill="${accent}" />
      <path d="M 43 26 C 43 28 85 28 85 26 Z" fill="#e03131" stroke="#e03131" stroke-width="3" />
    `;
  }
  if (accessory === "glasses_scar") {
    return `
      <rect x="36" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <rect x="68" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <line x1="60" y1="57" x2="68" y2="57" stroke="${eyes}" stroke-width="3" />
      <path d="M 64 30 L 60 38 L 64 38 L 58 46" stroke="#8b0000" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }
  if (accessory === "glasses_goatee") {
    return `
      <rect x="36" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <rect x="68" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" />
      <line x1="60" y1="57" x2="68" y2="57" stroke="${eyes}" stroke-width="3" />
      <path d="M 56 76 Q 64 90 72 76 Z" fill="${accent}" />
      <path d="M 52 70 Q 64 62 76 70" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round" />
    `;
  }
  if (accessory === "blindfold") {
    return `<rect x="36" y="48" width="56" height="18" fill="${accent}" />`;
  }
  return "";
}

async function persistAvatarChoice(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  selectedAvatarId = normalized;
  localStorage.setItem("cinerune:avatar-choice", JSON.stringify(normalized));

  if (!state.session?.user) return;

  try {
    const session = await ensureSession();
    if (!session) return;
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: {
        avatarId: normalized,
        username: state.session.user.user_metadata?.username || undefined
      }
    });
    applyUpdatedUser(updated?.user || updated, { avatarId: normalized });
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

function openAuthModal(mode = "login") {
  if (!el.authModal) return;
  if (mode === true) mode = "settings";
  if (mode === false) mode = "login";
  authModalMode = mode === "settings" || mode === "signup" ? mode : "login";
  el.authModal.removeAttribute("hidden");
  renderAuthUI();
}

async function syncProgressToCloud() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

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

  try {
    await apiRequest("/progress/push", {
      method: "POST",
      headers: authHeaders(session),
      body: { rows }
    });
  } catch {
    setStatus("Could not save progress right now.");
    return;
  }

  state.lastSyncAt = Date.now();
}

async function pullCloudProgress() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

  let data = null;
  try {
    data = await apiRequest("/progress/pull?limit=500", {
      headers: authHeaders(session)
    });
  } catch {
    setStatus("Could not load saved progress.");
    return;
  }

  (data || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id);
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;
    const cloudUpdatedAt = Date.parse(row.updated_at || "") || 0;
    const existing = state.progress[key];

    if (existing && cloudUpdatedAt <= Number(existing.updatedAt || 0)) {
      return;
    }

    state.progress[key] = {
      mediaType,
      id,
      season,
      episode,
      timestamp: Number(row.timestamp_seconds) || 0,
      duration: Number(row.duration_seconds) || 0,
      progress: Number(row.progress_percent) || 0,
      updatedAt: cloudUpdatedAt || Date.now(),
      title: titleById(id, mediaType) || `Title ${id}`,
      poster: posterById(id, mediaType) || ""
    };
  });

  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  await hydrateContinueRow();
  await refreshPersonalizedCollections();
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
  renderSearchPagination();
}

function hideSearchResults() {
  if (!el.searchResultsSection || !el.searchResultsGrid) return;
  el.searchResultsSection.setAttribute("hidden", "");
  el.searchResultsGrid.innerHTML = "";
  if (el.searchPagination) {
    el.searchPagination.setAttribute("hidden", "");
    el.searchPagination.innerHTML = "";
  }
}

function renderSearchPagination() {
  if (!el.searchPagination) return;
  const totalPages = Math.max(1, Number(state.searchTotalPages || 1));
  if (totalPages <= 1) {
    el.searchPagination.setAttribute("hidden", "");
    el.searchPagination.innerHTML = "";
    return;
  }

  const current = Math.max(1, Number(state.searchPage || 1));
  const pages = buildPagerPages(current, totalPages);
  el.searchPagination.innerHTML = pages.map((entry) => {
    if (entry.type === "gap") {
      return `<span class="pager-btn ghost">…</span>`;
    }
    const active = entry.page === current ? " active" : "";
    return `<button class="pager-btn${active}" type="button" data-page="${entry.page}">${entry.label}</button>`;
  }).join("");

  [...el.searchPagination.querySelectorAll(".pager-btn[data-page]")].forEach((node) => {
    node.addEventListener("click", async () => {
      const nextPage = Number(node.dataset.page || 1);
      if (!state.searchTerm || nextPage === state.searchPage) return;
      state.searchPage = nextPage;
      const result = await searchCatalog(state.searchTerm, { page: state.searchPage });
      const merged = (result.all || [...result.movies, ...result.tv]).slice(0, 24);
      state.searchResults = merged;
      state.searchTotalPages = Math.max(1, Number(result.totalPages || 1));
      renderSearchResults(merged);
    });
  });

  el.searchPagination.removeAttribute("hidden");
}

function buildPagerPages(current, total) {
  const pages = [];
  const clamp = (value) => Math.max(1, Math.min(total, value));
  const start = clamp(current - 2);
  const end = clamp(current + 2);

  pages.push({ type: "page", page: 1, label: "1" });
  if (start > 2) pages.push({ type: "gap" });

  for (let page = start; page <= end; page += 1) {
    if (page === 1 || page === total) continue;
    pages.push({ type: "page", page, label: String(page) });
  }

  if (end < total - 1) pages.push({ type: "gap" });
  if (total > 1) pages.push({ type: "page", page: total, label: String(total) });

  return pages;
}

function queueAutoSync(immediate = false) {
  if (!state.session?.user) return;

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
  if (!message) return;
  console.warn("[Cinerune]", message);
}

function setAuthHint(message) {
  el.authHint.textContent = message;
  const lowered = String(message || "").toLowerCase();
  const isError = lowered.includes("failed")
    || lowered.includes("do not match")
    || lowered.includes("provide")
    || lowered.includes("enter")
    || lowered.includes("wrong");
  if (isError) {
    nudgeAuthCard();
    el.authHint.classList.remove("auth-hint-flash");
    void el.authHint.offsetWidth;
    el.authHint.classList.add("auth-hint-flash");
    window.clearTimeout(setAuthHint.flashTimer);
    setAuthHint.flashTimer = window.setTimeout(() => {
      el.authHint.classList.remove("auth-hint-flash");
    }, 700);
  }
}

function nudgeAuthCard() {
  const card = el.authModal?.querySelector(".auth-card");
  if (!card) return;
  card.classList.remove("auth-card-shake");
  void card.offsetWidth;
  card.classList.add("auth-card-shake");
  window.clearTimeout(nudgeAuthCard.timer);
  nudgeAuthCard.timer = window.setTimeout(() => {
    card.classList.remove("auth-card-shake");
  }, 520);
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

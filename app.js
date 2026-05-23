import { apiRequest, authHeaders, ensureSession, getStoredSession, refreshStoredSessionUser, setStoredSession, clearStoredSession } from "./auth-client.js";
import { ensureSharedReportMenuItem, initSharedFooterReport, initSharedNavSearch, openSettingsModal, renderSharedAccount, saveSharedRecentSearch } from "./shared-ui.js?v=20260515-bugfix2";
import { showToast } from "./ui-toast.js";
import { syncBookmarksWithCloud } from "./bookmark-sync.js";
import { deleteProgressEntryFromCloud, forgetDeletedProgressEntry, readDeletedProgressMap, rememberDeletedProgressEntries } from "./progress-sync.js";
import { initHeaderNotifications } from "./notifications.js?v=20260515-bugfix2";
import * as catalogApi from "./catalog.js?v=20260515-bugfix2";
import { balancePosterGrid, initDragScroll } from "./drag-scroll.js?v=20260515-bugfix2";
import { getBookmarksKey, getNotificationReadKey, getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { buildResumableWatchHref, buildWatchHref, dedupeContinueProgressEntries, escapeHtml, formatSeconds, normalizePlaybackTimestamp, readJson, sanitizeText, setPosterImage } from "./shared-utils.js?v=20260515-bugfix2";

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

const homeCacheKey = "cinerune:home-cache";
const INPUT_LIMITS = {
  identifierMax: 80,
  usernameMax: 24,
  emailMax: 80,
  passwordMax: 128,
  searchMax: 80
};
const avatarOptions = [
  { id: "none", label: "No Avatar" },
  { id: "ironman", label: "Iron Man", src: "./avatars/ironman.png" },
  { id: "goku", label: "Goku", src: "./avatars/goku.jpg" },
  { id: "darthvader", label: "Darth Vader", src: "./avatars/darthvader.jpg" },
  { id: "tonysoprano", label: "Tony Soprano", src: "./avatars/tonysoprano.jpg" },
  { id: "luffy", label: "Monkey D. Luffy", src: "./avatars/luffy.jpg" },
  { id: "walterwhite", label: "Walter White", src: "./avatars/walterwhite.jpg" }
];

const el = {
  notificationsWrap: document.getElementById("notificationsWrap"),
  notificationsBtn: document.getElementById("notificationsBtn"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsMenu: document.getElementById("notificationsMenu"),
  notificationsList: document.getElementById("notificationsList"),
  notificationsMarkAll: document.getElementById("notificationsMarkAll"),
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
  authAddEmailView: document.getElementById("authAddEmailView"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  signedInHint: document.getElementById("signedInHint"),
  settingsCurrentUsernameDisplay: document.getElementById("settingsCurrentUsernameDisplay"),
  settingsUsername: document.getElementById("settingsUsername"),
  settingsUsernameConfirm: document.getElementById("settingsUsernameConfirm"),
  settingsCurrentEmailDisplay: document.getElementById("settingsCurrentEmailDisplay"),
  settingsEmail: document.getElementById("settingsEmail"),
  settingsEmailConfirm: document.getElementById("settingsEmailConfirm"),
  settingsCurrentPassword: document.getElementById("settingsCurrentPassword"),
  settingsPassword: document.getElementById("settingsPassword"),
  settingsPasswordConfirm: document.getElementById("settingsPasswordConfirm"),
  settingsDeleteConfirm: document.getElementById("settingsDeleteConfirm"),
  saveUsernameBtn: document.getElementById("saveUsernameBtn"),
  saveEmailBtn: document.getElementById("saveEmailBtn"),
  savePasswordBtn: document.getElementById("savePasswordBtn"),
  deleteAccountBtn: document.getElementById("deleteAccountBtn"),
  authIdentifier: document.getElementById("authIdentifier"),
  authPassword: document.getElementById("authPassword"),
  forgotPasswordBtn: document.getElementById("forgotPasswordBtn"),
  addEmailUsername: document.getElementById("addEmailUsername"),
  addEmailPassword: document.getElementById("addEmailPassword"),
  addEmailInput: document.getElementById("addEmailInput"),
  addEmailConfirm: document.getElementById("addEmailConfirm"),
  addEmailBtn: document.getElementById("addEmailBtn"),
  cancelAddEmailBtn: document.getElementById("cancelAddEmailBtn"),
  signupUsername: document.getElementById("signupUsername"),
  signupEmail: document.getElementById("signupEmail"),
  signupEmailConfirm: document.getElementById("signupEmailConfirm"),
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
  continuePrevBtn: document.getElementById("continuePrevBtn"),
  continueNextBtn: document.getElementById("continueNextBtn"),
  recommendedGrid: document.getElementById("recommendedGrid"),
  recommendedPrevBtn: document.getElementById("recommendedPrevBtn"),
  recommendedNextBtn: document.getElementById("recommendedNextBtn"),
  trendingGrid: document.getElementById("trendingGrid"),
  trendingPrevBtn: document.getElementById("trendingPrevBtn"),
  trendingNextBtn: document.getElementById("trendingNextBtn"),
  popularGrid: document.getElementById("popularGrid"),
  popularPrevBtn: document.getElementById("popularPrevBtn"),
  popularNextBtn: document.getElementById("popularNextBtn"),
  airingTodayGrid: document.getElementById("airingTodayGrid"),
  airingTodayPrevBtn: document.getElementById("airingTodayPrevBtn"),
  airingTodayNextBtn: document.getElementById("airingTodayNextBtn"),
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
    popular: [],
    airingToday: []
  },
  genreOptions: [],
  countryOptions: [],
  explorerMode: "genre",
  searchTerm: "",
  searchResults: [],
  searchPage: 1,
  searchTotalPages: 1,
  notifications: [],
  readNotificationIds: new Set(),
  notificationsReady: false,
  autoSyncTimer: null,
  lastSyncAt: 0,
  progressPullTimer: null,
  deletedProgressKeys: new Set(),
  deletedProgressMap: {},
  lastProgressPullAt: 0,
  progressPullEventsBound: false,
  heroRotationTimer: null,
  heroPool: [],
  heroIndex: 0,
  passwordRecoveryMode: false
};

let selectedAvatarId = readJson("cinerune:avatar-choice", "none");
let authModalMode = "login";
let suppressLocalSessionUpdate = false;
const startupQuery = new URLSearchParams(window.location.search);
const startupAuthMode = startupQuery.get("auth") || startupQuery.get("modal");
const startupMenu = startupQuery.get("menu");
const startupHash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
const startupHashType = startupHash.get("type") || "";
const startupAuthCallback = startupHash.has("access_token");
const startupRecoveryMode = startupHashType === "recovery";
const startupEmailChangeMode = startupHashType === "email_change";
const startupConfirmationMode = startupAuthCallback && !startupRecoveryMode && !startupEmailChangeMode;

boot();

async function boot() {
  bindEvents();
  initSharedFooterReport(() => state.session);
  syncProgressState();

  initConfiguredTmdb();

  await initAuth();
  if (startupAuthCallback) {
    await hydrateSessionFromHash();
  }
  await Promise.allSettled([
    refreshHome(),
    hydrateContinueRow()
  ]);

  if (startupAuthMode === "settings" && state.session?.user) {
    openSettingsModal();
  } else if (startupAuthMode === "login") {
    openAuthModal(false);
  }

  if (startupRecoveryMode && state.session?.user) {
    openSettingsModal("password");
  } else if (startupEmailChangeMode && state.session?.user) {
    openSettingsModal("email");
    setAuthHint("Email confirmed.");
  } else if (startupConfirmationMode && state.session?.user) {
    openAuthModal("settings");
    setAuthHint("Email confirmed. You are signed in; you can close this tab.");
  }

  if (startupMenu === "genre" || startupMenu === "country") {
    state.explorerMode = startupMenu;
    renderMegaMenu();
    openMegaMenu();
  }

  registerServiceWorker();
}

function bindEvents() {
  document.querySelectorAll("[data-settings-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleSettingsPanel(button.dataset.settingsToggle));
  });

  if (el.toggleAuth) {
    el.toggleAuth.addEventListener("click", () => {
      if (state.session?.user) {
        toggleAccountMenu();
      } else {
        openAuthModal();
      }
    });
  }

  bindRowArrows(el.continueGrid, el.continuePrevBtn, el.continueNextBtn);
  bindRowArrows(el.recommendedGrid, el.recommendedPrevBtn, el.recommendedNextBtn);
  bindRowArrows(el.trendingGrid, el.trendingPrevBtn, el.trendingNextBtn);
  bindRowArrows(el.popularGrid, el.popularPrevBtn, el.popularNextBtn);
  bindRowArrows(el.airingTodayGrid, el.airingTodayPrevBtn, el.airingTodayNextBtn);

  if (el.closeAuth) {
    el.closeAuth.addEventListener("click", closeAuthModal);
  }
  if (el.authBackdrop) {
    el.authBackdrop.addEventListener("click", closeAuthModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAuthModal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!state.session?.user) return;
    const stale = Date.now() - state.lastProgressPullAt > 30000;
    if (stale) void pullCloudProgress();
  });

  if (el.signInBtn) el.signInBtn.addEventListener("click", signIn);
  if (el.forgotPasswordBtn) el.forgotPasswordBtn.addEventListener("click", requestPasswordReset);
  if (el.signUpBtn) el.signUpBtn.addEventListener("click", signUp);
  if (el.addEmailBtn) el.addEmailBtn.addEventListener("click", addEmail);
  if (el.cancelAddEmailBtn) el.cancelAddEmailBtn.addEventListener("click", () => openAuthModal("login"));
  if (el.signOutBtn) el.signOutBtn.addEventListener("click", signOut);
  if (el.signOutMenuBtn) el.signOutMenuBtn.addEventListener("click", signOut);
  if (el.saveUsernameBtn) el.saveUsernameBtn.addEventListener("click", saveUsername);
  if (el.saveEmailBtn) el.saveEmailBtn.addEventListener("click", saveEmail);
  if (el.savePasswordBtn) el.savePasswordBtn.addEventListener("click", savePassword);
  if (el.deleteAccountBtn) el.deleteAccountBtn.addEventListener("click", deleteAccount);
  if (el.loginTabBtn) el.loginTabBtn.addEventListener("click", () => openAuthModal("login"));
  if (el.signupTabBtn) el.signupTabBtn.addEventListener("click", () => openAuthModal("signup"));

  if (el.openAccountSettings) {
    el.openAccountSettings.addEventListener("click", () => {
      closeAccountMenu();
      openSettingsModal();
    });
  }
  ensureSharedReportMenuItem(el.accountMenu, () => state.session);

  if (el.authIdentifier) {
    el.authIdentifier.addEventListener("keydown", onAuthEnter);
  }
  if (el.authPassword) {
    el.authPassword.addEventListener("keydown", onAuthEnter);
  }
  [el.signupUsername, el.signupEmail, el.signupEmailConfirm, el.signupPassword, el.signupConfirm].forEach((input) => {
    if (input) input.addEventListener("keydown", onAuthEnter);
  });
  [el.addEmailPassword, el.addEmailInput, el.addEmailConfirm].forEach((input) => {
    if (input) input.addEventListener("keydown", onAuthEnter);
  });
  [el.settingsUsername, el.settingsUsernameConfirm, el.settingsEmail, el.settingsEmailConfirm, el.settingsCurrentPassword, el.settingsPassword, el.settingsPasswordConfirm, el.settingsDeleteConfirm].forEach((input) => {
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
    initSharedNavSearch({
      getProgress: () => state.progress,
      onClear: () => {
        state.searchResults = [];
        hideSearchResults();
      },
      onResults: (result, term) => {
        state.searchTerm = term;
        state.searchPage = 1;
        const merged = (result.all || [...result.movies, ...result.tv]).slice(0, 24);
        state.searchResults = merged;
        state.searchTotalPages = Math.max(1, Number(result.totalPages || 1));
        renderSearchResults(merged);
        renderSearchPagination();
      },
      onError: hideSearchResults
    });
    el.navSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const term = sanitizeText(el.navSearchInput.value, INPUT_LIMITS.searchMax);
        if (term) {
          saveSharedRecentSearch(term);
          openSearchPage(term);
        }
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (el.accountMenuWrap && !el.accountMenuWrap.contains(event.target)) {
      closeAccountMenu();
    }
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
    if (event.key === "cinerune:session") {
      void handleSessionStorageChange();
      return;
    }

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
  window.addEventListener("cinerune:session-updated", () => {
    if (suppressLocalSessionUpdate) return;
    void handleSessionStorageChange({ quiet: true });
  });
  window.addEventListener("pageshow", () => {
    const latestSession = getStoredSession();
    const latestAvatar = latestSession?.user?.user_metadata?.avatarId;
    if (latestAvatar && latestAvatar !== state.session?.user?.user_metadata?.avatarId) {
      void handleSessionStorageChange({ quiet: true });
      return;
    }
    syncProgressState();
    syncBookmarksState();
    if (state.session?.user) {
      void pullCloudProgress();
      void pullCloudBookmarks();
    } else {
      void hydrateContinueRow();
    }
  });
}

async function handleSessionStorageChange(options = {}) {
  const session = await ensureSession();
  state.session = session;
  syncProgressState();
  syncBookmarksState();
  if (state.session?.user) {
    state.bookmarks = await syncBookmarksWithCloud(state.session, state.bookmarks);
    localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
  }
  await pullNotificationReadState();
  renderAuthUI();
  if (session?.user) {
    if (!options.quiet) setAuthHint("Signed in.");
    if (!options.quiet) closeAuthModal();
    await pullCloudProgress();
    startProgressPulling();
  } else {
    stopProgressPulling();
    refreshPersonalizedCollections();
    hydrateContinueRow();
  }
}

function bindRowArrows(grid, prevBtn, nextBtn) {
  if (!grid || !prevBtn || !nextBtn) return;
  const scrollByAmount = () => Math.max(240, Math.floor(grid.clientWidth * 0.75));
  prevBtn.addEventListener("click", () => {
    grid.scrollBy({ left: -scrollByAmount(), behavior: "smooth" });
  });
  nextBtn.addEventListener("click", () => {
    grid.scrollBy({ left: scrollByAmount(), behavior: "smooth" });
  });
}

async function refreshHome() {
  const cachedHomeData = readJson(homeCacheKey, null);
  if (cachedHomeData) {
    await applyHomeData(cachedHomeData, { personalize: false });
  } else {
    renderHomeSkeletons();
  }

  void refreshExplorerOptions();

  const homeResult = await Promise.allSettled([fetchHomeCatalog()]).then((results) => results[0]);

  let homeData = null;
  if (homeResult.status === "fulfilled") {
    homeData = homeResult.value;
    localStorage.setItem(homeCacheKey, JSON.stringify(homeData));
  } else {
    homeData = readJson(homeCacheKey, null);
  }

  if (!homeData && !cachedHomeData) {
    renderUnavailableState();
    return;
  }

  if (homeData) {
    await applyHomeData(homeData);
  }

  void initHeaderNotifications();
  startHeroRotation();
}

async function refreshExplorerOptions() {
  const [genresResult, countriesResult] = await Promise.allSettled([
    fetchGenreOptions(),
    fetchCountryOptions()
  ]);
  const genreData = genresResult.status === "fulfilled" ? genresResult.value : { movie: [], tv: [] };
  state.genreOptions = dedupeExplorerOptions([...(genreData.movie || []), ...(genreData.tv || [])], "id");
  state.countryOptions = countriesResult.status === "fulfilled" ? (countriesResult.value || []) : [];
  renderMegaMenu();
}

function renderHomeSkeletons() {
  [
    el.recommendedGrid,
    el.trendingGrid,
    el.popularGrid,
    el.airingTodayGrid
  ].forEach((grid) => renderSkeletonCards(grid, 12));
}

async function applyHomeData(homeData, options = {}) {
  const recommendedItems = filterAllowedCatalogItems(homeData.recommended || []);
  const trendingItems = filterAllowedCatalogItems(homeData.trending || []);
  const popularItems = filterAllowedCatalogItems(homeData.popular || []);
  const airingTodayItems = filterAllowedCatalogItems(homeData.airingToday || []);
  state.homeData.hero = isSensitiveCatalogItem(homeData.hero)
    ? (trendingItems.find((item) => item.backdrop && item.poster) || popularItems.find((item) => item.backdrop && item.poster) || recommendedItems[0] || null)
    : (homeData.hero || null);
  state.homeData.recommended = options.personalize === false
    ? recommendedItems.slice(0, 24)
    : await buildRecommendedRow({ ...homeData, recommended: recommendedItems });
  state.homeData.trending = trendingItems;
  state.homeData.popular = popularItems;
  state.homeData.airingToday = airingTodayItems;

  renderHero();
  renderRecommended();
  renderTrending();
  renderPopular();
  renderAiringToday();
}

function filterAllowedCatalogItems(items) {
  return (items || []).filter((item) => !isSensitiveCatalogItem(item));
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
  if (el.airingTodayGrid) el.airingTodayGrid.innerHTML = "";
  if (el.megaMenuGrid) el.megaMenuGrid.innerHTML = "";
}

function renderHero() {
  const item = state.homeData.hero;
  if (!item) return;
  ensureHeroControls();

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

  state.heroPool = pool;
  state.heroIndex = Math.max(0, pool.findIndex((item) => (
    item.id === state.homeData.hero?.id && item.mediaType === state.homeData.hero?.mediaType
  )));

  if (pool.length < 2) return;

  state.heroRotationTimer = window.setInterval(() => {
    showHeroAt(state.heroIndex + 1);
  }, 12000);
}

function restartHeroRotationTimer() {
  if (state.heroRotationTimer) {
    clearInterval(state.heroRotationTimer);
    state.heroRotationTimer = null;
  }
  if (state.heroPool.length < 2) return;
  state.heroRotationTimer = window.setInterval(() => {
    showHeroAt(state.heroIndex + 1);
  }, 12000);
}

function ensureHeroControls() {
  if (!el.heroSection || el.heroSection.querySelector(".hero-controls")) return;
  const controls = document.createElement("div");
  controls.className = "hero-controls";
  controls.innerHTML = `
    <button class="hero-control-btn" type="button" data-hero-step="-1" aria-label="Previous featured title">‹</button>
    <button class="hero-control-btn" type="button" data-hero-step="1" aria-label="Next featured title">›</button>
  `;
  controls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hero-step]");
    if (!button) return;
    showHeroAt(state.heroIndex + Number(button.dataset.heroStep || 1));
    restartHeroRotationTimer();
  });
  el.heroSection.appendChild(controls);
}

function showHeroAt(index) {
  if (!state.heroPool.length) return;
  const nextIndex = (Number(index || 0) + state.heroPool.length) % state.heroPool.length;
  const next = state.heroPool[nextIndex];
  if (!next) return;
  state.heroIndex = nextIndex;
  state.homeData.hero = next;
  renderHero();
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

function renderAiringToday() {
  if (!el.airingTodayGrid) return;
  renderPosterCards(el.airingTodayGrid, (state.homeData.airingToday || []).slice(0, 24));
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
    const flag = isGenre ? "" : countryFlagMarkup(value);
    return `
    <button class="mega-menu-item" type="button" data-mode="${state.explorerMode}" data-value="${escapeHtml(value)}" data-name="${escapeHtml(label)}">
      ${flag ? `<span class="country-flag" aria-hidden="true">${flag}</span>` : ""}<span>${escapeHtml(label)}</span>
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
  const entries = dedupeContinueProgressEntries(Object.values(state.progress || {}))
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
      progressPercent: Math.max(0, Math.min(100, Number(entry.progress || 0))),
      resumeSeconds: normalizePlaybackTimestamp(entry.timestamp, entry.duration),
      progressKey: `${entry.mediaType}:${entry.id}:${entry.season || 1}:${entry.episode || 1}`,
      progressMeta: entry.mediaType === "tv"
        ? `S${entry.season || 1} E${entry.episode || 1} • ${formatSeconds(normalizePlaybackTimestamp(entry.timestamp, entry.duration))}`
        : `${Math.round(Number(entry.progress || 0))}% • ${formatSeconds(normalizePlaybackTimestamp(entry.timestamp, entry.duration))}`
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

  items.forEach((item, index) => {
    const node = el.posterCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".poster-btn");
    const image = node.querySelector(".poster-img");
    const title = node.querySelector(".poster-title");
    const sub = node.querySelector(".poster-sub");
    const meta = node.querySelector(".poster-meta");

    setPosterImage(image, item, { eager: index < 8 });
    image.alt = `${item.title} poster`;
    title.textContent = item.title;

    if (options.showProgressMeta && item.progressMeta) {
      node.classList.add("continue-card");
      renderContinueMeta(sub, item);
      sub.classList.add("continue-meta");
      const progressTrack = document.createElement("span");
      progressTrack.className = "continue-progress";
      progressTrack.innerHTML = `<span style="width:${Math.max(0, Math.min(100, Number(item.progressPercent || 0)))}%"></span>`;
      if (meta) {
        meta.append(sub, title);
        link.insertBefore(progressTrack, meta);
      } else {
        link.appendChild(progressTrack);
      }
    } else {
      sub.classList.remove("continue-meta");
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

    const resume = Boolean(options.resumeOnClick);
    const href = resume
      ? buildWatchHref(
        item.id,
        item.mediaType,
        item.season || item.defaultSeason || 1,
        item.episode || item.defaultEpisode || 1,
        true
      )
      : buildResumableWatchHref(item, state.progress);
    if (link) link.href = href;

    fragment.appendChild(node);
  });

  container.appendChild(fragment);
  balancePosterGrid(container);
  initDragScroll();
}

function renderSkeletonCards(container, count = 12) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <article class="poster-card skeleton-card" aria-hidden="true">
      <span class="skeleton skeleton-poster"></span>
      <span class="skeleton skeleton-line"></span>
      <span class="skeleton skeleton-line short"></span>
    </article>
  `).join("");
}

function removeContinueEntry(progressEntryKey) {
  if (!progressEntryKey || !state.progress?.[progressEntryKey]) return;
  const entry = state.progress[progressEntryKey];
  rememberDeletedProgressEntries(state.session, [entry]);
  state.deletedProgressMap = readDeletedProgressMap(state.session);
  state.deletedProgressKeys = new Set(Object.keys(state.deletedProgressMap));
  delete state.progress[progressEntryKey];
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  showToast("Removed from Continue Watching");
  hydrateContinueRow();
  void deleteProgressEntryFromCloud(state.session, entry).then(() => {
    state.deletedProgressMap = readDeletedProgressMap(state.session);
    state.deletedProgressKeys = new Set(Object.keys(state.deletedProgressMap));
  });
  void refreshPersonalizedCollections();
}

async function buildRecommendedRow(homeData) {
  const historyEntries = collectRecommendationHistory();
  const excludedKeys = collectRecommendationExcludedKeys();
  const fallback = (homeData.recommended || [])
    .filter((item) => !excludedKeys.has(`${item.mediaType}:${Number(item.id || 0)}`))
    .slice(0, 24);

  if (!historyEntries.length) {
    return fallback;
  }

  try {
    const personalized = await fetchRecommendedFromHistory(historyEntries, 24);
    const filtered = personalized.filter((item) => !excludedKeys.has(`${item.mediaType}:${Number(item.id || 0)}`));
    if (filtered.length) {
      return filtered.slice(0, 24);
    }
  } catch {
    // fall back to non-personalized home data
  }

  return fallback;
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

function collectRecommendationExcludedKeys() {
  const keys = new Set();
  Object.values(state.progress || {}).forEach((entry) => {
    const id = Number(entry?.id || 0);
    if (!id) return;
    keys.add(`${entry.mediaType === "tv" ? "tv" : "movie"}:${id}`);
  });
  Object.values(state.bookmarks || {}).forEach((entry) => {
    const id = Number(entry?.id || 0);
    if (!id) return;
    if (entry?.status === "watching" || entry?.status === "watched") {
      keys.add(`${entry.mediaType === "tv" ? "tv" : "movie"}:${id}`);
    }
  });
  return keys;
}

async function refreshPersonalizedCollections() {
  state.homeData.recommended = await buildRecommendedRow(state.homeData);
  renderRecommended();
  void initHeaderNotifications();
}

function closeNotificationsMenu() {
  if (!el.notificationsMenu) return;
  el.notificationsMenu.setAttribute("hidden", "");
  el.notificationsBtn?.setAttribute("aria-expanded", "false");
  updateMenuScrimVisibility();
}

function toggleSettingsPanel(panelName) {
  if (!panelName) return;
  const targetPanel = document.querySelector(`[data-settings-panel="${cssEscape(panelName)}"]`);
  const targetButton = document.querySelector(`[data-settings-toggle="${cssEscape(panelName)}"]`);
  if (!targetPanel || !targetButton) return;

  const shouldOpen = targetPanel.hasAttribute("hidden");
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.setAttribute("hidden", "");
  });
  document.querySelectorAll("[data-settings-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });

  if (shouldOpen) {
    if (panelName === "password") {
      if (el.settingsCurrentPassword) el.settingsCurrentPassword.value = "";
      if (el.settingsPassword) el.settingsPassword.value = "";
      if (el.settingsPasswordConfirm) el.settingsPasswordConfirm.value = "";
    } else if (panelName === "delete") {
      if (el.settingsDeleteConfirm) el.settingsDeleteConfirm.value = "";
    }
    targetPanel.removeAttribute("hidden");
    targetButton.setAttribute("aria-expanded", "true");
    const focusTarget = targetPanel.querySelector("input, button");
    if (focusTarget && panelName !== "avatar") {
      window.setTimeout(() => focusTarget.focus(), 0);
    }
  }
}

function closeSettingsPanels() {
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.setAttribute("hidden", "");
  });
  document.querySelectorAll("[data-settings-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
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

function syncBookmarksState() {
  state.bookmarks = readJson(getBookmarksKey(state.session), {});
}

function syncNotificationReadState() {
  const values = readJson(getNotificationReadKey(state.session), []);
  state.readNotificationIds = new Set(Array.isArray(values) ? values : []);
}

async function pullNotificationReadState() {
  syncNotificationReadState();
  if (!state.session?.user) return;
  try {
    const remoteState = await apiRequest("/notifications/read", {
      method: "GET",
      headers: authHeaders(state.session)
    });
    const remote = remoteState?.notificationReadIds;
    if (!Array.isArray(remote)) return;
    state.readNotificationIds = new Set(remote.slice(-500));
  } catch {
    // Local notification read state is still valid if the cloud read fails.
  }
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
  state.deletedProgressMap = readDeletedProgressMap(state.session);
  state.deletedProgressKeys = new Set(Object.keys(state.deletedProgressMap));
}

function startProgressPulling() {
  stopProgressPulling();
  if (!state.session?.user) return;
  state.progressPullTimer = window.setInterval(() => {
    if (!state.session?.user) return;
    if (document.visibilityState !== "visible") return;
    void pullCloudProgress();
    void pullCloudBookmarks();
  }, 300000);
  if (!state.progressPullEventsBound) {
    state.progressPullEventsBound = true;
    window.addEventListener("focus", () => {
      if (state.session?.user) {
        void pullCloudProgress();
        void pullCloudBookmarks();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.session?.user) {
        void pullCloudProgress();
        void pullCloudBookmarks();
      }
    });
  }
}

function stopProgressPulling() {
  if (state.progressPullTimer) {
    window.clearInterval(state.progressPullTimer);
    state.progressPullTimer = null;
  }
}

async function initAuth() {
  const storedSession = getStoredSession();
  if (storedSession?.user) {
    state.session = storedSession;
    syncProgressState();
    syncBookmarksState();
    renderAuthUI();
  }
  try {
    const session = await refreshStoredSessionUser();
    state.session = session;
    syncProgressState();
    syncBookmarksState();
    if (state.session?.user) {
      void pullCloudBookmarks();
    }
    void pullNotificationReadState();
    renderAuthUI();
    void initHeaderNotifications();
    if (state.session?.user) {
      void pullCloudProgress();
      startProgressPulling();
    } else {
      stopProgressPulling();
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
    el.authAddEmailView?.setAttribute("hidden", "");
  }

  if (signedIn) {
    const user = state.session.user;
    const publicEmail = displayEmail(user.email);
    el.authUserEmail.textContent = publicEmail
      ? `${user.user_metadata?.username || user.id} (${publicEmail})`
      : (user.user_metadata?.username || user.id);
    const avatarId = normalizeAvatarId(user.user_metadata?.avatarId || selectedAvatarId);
    selectedAvatarId = avatarId;
    renderAvatarPickers();
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, user.user_metadata?.username || "Account");
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
      el.settingsUsername.value = "";
    }
    if (el.settingsUsernameConfirm) {
      el.settingsUsernameConfirm.value = "";
    }
    if (el.settingsCurrentUsernameDisplay) {
      el.settingsCurrentUsernameDisplay.value = user.user_metadata?.username || "";
    }
    if (el.settingsEmail) {
      el.settingsEmail.value = "";
    }
    if (el.settingsEmailConfirm) {
      el.settingsEmailConfirm.value = "";
    }
    if (el.settingsCurrentEmailDisplay) {
      el.settingsCurrentEmailDisplay.value = publicEmail || "No email added";
    }
    updatePasswordSettingsLabels();
    updateEmailSettingsLabels();
  } else {
    const avatarId = normalizeAvatarId(selectedAvatarId);
    renderActiveAvatar(avatarId);
    renderAccountButton(avatarId, "Login");
    closeAccountMenu();
    el.homeListsLink?.setAttribute("hidden", "");
    if (el.toggleAuth) el.toggleAuth.title = "Sign in";
    if (el.settingsUsername) el.settingsUsername.value = "";
    if (el.settingsUsernameConfirm) el.settingsUsernameConfirm.value = "";
    if (el.settingsCurrentUsernameDisplay) el.settingsCurrentUsernameDisplay.value = "";
    if (el.settingsEmail) el.settingsEmail.value = "";
    if (el.settingsEmailConfirm) el.settingsEmailConfirm.value = "";
    if (el.settingsCurrentEmailDisplay) el.settingsCurrentEmailDisplay.value = "";
    if (el.settingsCurrentPassword) el.settingsCurrentPassword.value = "";
    if (el.settingsPassword) el.settingsPassword.value = "";
    if (el.settingsPasswordConfirm) el.settingsPasswordConfirm.value = "";
    if (el.settingsDeleteConfirm) el.settingsDeleteConfirm.value = "";
    updatePasswordSettingsLabels();
    updateEmailSettingsLabels();
    setAuthHint("");
  }

  if (signedIn) {
    el.authIdentifier.value = "";
    el.authPassword.value = "";
  }

  void initHeaderNotifications();
}

function updatePasswordSettingsLabels() {
  document.querySelectorAll('[data-settings-toggle="password"] small').forEach((node) => {
    node.textContent = state.passwordRecoveryMode
      ? "Enter your new password twice."
      : "Old password required, new password entered twice.";
  });
  const currentPasswordLabel = el.settingsCurrentPassword?.closest("label");
  currentPasswordLabel?.toggleAttribute("hidden", state.passwordRecoveryMode);
  if (state.passwordRecoveryMode && el.settingsCurrentPassword) {
    el.settingsCurrentPassword.value = "";
  }
}

function updateEmailSettingsLabels() {
  const hasPublicEmail = Boolean(displayEmail(state.session?.user?.email || ""));
  document.querySelectorAll('[data-settings-toggle="email"] strong').forEach((node) => {
    node.textContent = hasPublicEmail ? "Change Email" : "Add Email";
  });
  document.querySelectorAll('[data-settings-toggle="email"] small').forEach((node) => {
    node.textContent = hasPublicEmail
      ? "Update the email used for login and password reset."
      : "Add a login backup and password reset address.";
  });
  if (el.saveEmailBtn) {
    el.saveEmailBtn.textContent = hasPublicEmail ? "Change Email" : "Save Email";
  }
}

function getUserFriendlyError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  
  // Authentication errors
  if (msg.includes("invalid") || msg.includes("wrong") || msg.includes("incorrect")) return "Username/email or password is incorrect.";
  if (msg.includes("not found")) return "Account not found.";
  if (msg.includes("already") && msg.includes("use")) return "This email or username is already in use.";
  if (msg.includes("already")) return "This already exists.";
  if (msg.includes("too many")) return "Too many attempts. Try again in a few minutes.";
  if (msg.includes("rate limit")) return "Too many attempts. Try again in a few minutes.";
  if (msg.includes("email")) return "Email is invalid or already in use.";
  if (msg.includes("password")) return "Password doesn't meet requirements or is incorrect.";
  if (msg.includes("username")) return "Username is invalid or already in use.";
  if (msg.includes("confirm")) return "Please check your email to confirm.";
  if (msg.includes("verified")) return "Email not verified yet. Check your inbox.";
  
  // Default: don't show raw error, just say something generic
  return "Could not complete that action. Try again.";
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
      setAuthHint("Username/email or password is wrong. Try again.");
      return;
    }
    suppressLocalSessionUpdate = true;
    setStoredSession(session);
    suppressLocalSessionUpdate = false;
    state.session = session;
    syncProgressState();
    syncBookmarksState();
    await pullNotificationReadState();
    selectedAvatarId = normalizeAvatarId(session.user?.user_metadata?.avatarId || "none");
    closeAuthModal();
    renderAuthUI();
    await pullCloudProgress();
    setAuthHint("Signed in.");
  } catch (error) {
    if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
      setAuthHint("Username/email or password is wrong. Try again.");
      return;
    }
    setAuthHint(getUserFriendlyError(error));
  }
}

async function requestPasswordReset() {
  const identifier = normalizeIdentifier(el.authIdentifier?.value || "");
  if (!identifier) {
    setAuthHint("Enter your username or email first.");
    return;
  }

  try {
    const response = await apiRequest("/auth/forgot", {
      method: "POST",
      body: { identifier }
    });
    
    if (response.needsEmail) {
      // Show add email form
      if (el.addEmailUsername) {
        el.addEmailUsername.value = response.username || "";
      }
      if (el.addEmailInput) {
        el.addEmailInput.value = "";
      }
      if (el.addEmailPassword) {
        el.addEmailPassword.value = "";
      }
      showAuthView("addEmail");
      setAuthHint("This account needs an email before password reset can work.");
      return;
    }
    
    setAuthHint("If your account exists, a reset link has been sent to your email.");
  } catch {
    setAuthHint("If your account exists, a reset link has been sent to your email.");
  }
}

async function addEmail() {
  const username = normalizeUsername(el.addEmailUsername?.value || "");
  const password = String(el.addEmailPassword?.value || "");
  const email = normalizeEmail(el.addEmailInput?.value || "", false);
  const emailConfirm = normalizeEmail(el.addEmailConfirm?.value || "", false);

  if (!username || !email || !isValidPassword(password)) {
    setAuthHint("Enter your current password and a valid email.");
    return;
  }
  if (email !== emailConfirm) {
    setAuthHint("Emails do not match.");
    return;
  }

  try {
    await apiRequest("/auth/add-email", {
      method: "POST",
      body: { username, password, email }
    });
    setAuthHint("Check your email to confirm the address, then request a reset link.");
    // Clear the form
    if (el.addEmailPassword) el.addEmailPassword.value = "";
    if (el.addEmailInput) el.addEmailInput.value = "";
    if (el.addEmailConfirm) el.addEmailConfirm.value = "";
    // Go back to login after a brief delay
    setTimeout(() => {
      openAuthModal("login");
      setAuthHint("");
    }, 2000);
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
  }
}

async function signUp() {
  const username = normalizeUsername(el.signupUsername.value);
  const email = normalizeEmail(el.signupEmail?.value || "", true);
  const emailConfirm = normalizeEmail(el.signupEmailConfirm?.value || "", true);
  const password = String(el.signupPassword.value || "");
  const confirmPassword = String(el.signupConfirm.value || "");

  if (!username || !isValidPassword(password)) {
    setAuthHint("Provide a username and a password (6+ chars).");
    return;
  }
  if (email === null || emailConfirm === null) {
    setAuthHint("Enter a valid email address or leave both blank.");
    return;
  }
  if ((email || emailConfirm) && email !== emailConfirm) {
    setAuthHint("Emails do not match.");
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
        email: email || undefined,
        password,
        avatarId: "none"
      }
    });
    let session = null;
    try {
      session = await apiRequest("/auth/login", {
        method: "POST",
        body: { identifier: username, password }
      });
    } catch {
      session = null;
    }
    if (!session?.access_token) {
      setAuthHint(email
        ? "Account created. Check your email if confirmation is required, then sign in."
        : "Account created. Sign in with your username and password.");
      return;
    }
    suppressLocalSessionUpdate = true;
    setStoredSession(session);
    suppressLocalSessionUpdate = false;
    state.session = session;
    selectedAvatarId = normalizeAvatarId(session.user?.user_metadata?.avatarId || "none");
    syncProgressState();
    syncBookmarksState();
    await pullNotificationReadState();
    closeAuthModal();
    renderAuthUI();
    await pullCloudProgress();
    setAuthHint("Account created.");
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
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
  stopProgressPulling();
  syncProgressState();
  syncBookmarksState();
  syncNotificationReadState();
  closeAuthModal();
  renderAuthUI();
  refreshPersonalizedCollections();
  hydrateContinueRow();
  window.dispatchEvent(new CustomEvent("cinerune:session-updated", { detail: null }));
}

function renderContinueMeta(container, item) {
  container.textContent = "";
  const main = document.createElement("span");
  main.className = "continue-meta-main";
  const extra = document.createElement("span");
  extra.className = "continue-meta-extra";
  const detail = document.createElement("span");
  detail.className = "continue-meta-detail";
  detail.textContent = [item.mediaType === "movie" ? "Movie" : "TV", item.year].filter(Boolean).join(" | ");

  if (item.mediaType === "tv") {
    main.textContent = `S${item.season || 1} E${item.episode || 1}`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  } else {
    main.textContent = `${Math.round(Number(item.progressPercent || 0))}%`;
    extra.textContent = formatSeconds(item.resumeSeconds || 0);
  }
  container.append(main, extra);
  if (detail.textContent) container.append(detail);
}

async function saveUsername() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }

  const username = normalizeUsername(el.settingsUsername?.value);
  const usernameConfirm = normalizeUsername(el.settingsUsernameConfirm?.value);
  if (!username) {
    setAuthHint("Provide a username with 3-24 letters, numbers, dots, underscores, or dashes.");
    return;
  }
  if (username !== usernameConfirm) {
    setAuthHint("Usernames do not match.");
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
    if (el.settingsUsername) el.settingsUsername.value = "";
    if (el.settingsUsernameConfirm) el.settingsUsernameConfirm.value = "";
    if (el.settingsCurrentUsernameDisplay) el.settingsCurrentUsernameDisplay.value = username;
    setAuthHint("Username updated.");
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
  }
}

async function saveEmail() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }

  const email = normalizeEmail(el.settingsEmail?.value || "", true);
  const emailConfirm = normalizeEmail(el.settingsEmailConfirm?.value || "", true);
  if (email === null || !email) {
    setAuthHint("Enter a valid email address.");
    return;
  }
  if (email !== emailConfirm) {
    setAuthHint("Emails do not match.");
    return;
  }

  try {
    const session = await ensureSession();
    if (!session) {
      setAuthHint("Sign in again to update your email.");
      return;
    }
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: {
        email,
        avatarId: normalizeAvatarId(state.session.user.user_metadata?.avatarId || selectedAvatarId)
      }
    });
    applyUpdatedUser(updated?.user || updated, { email });
    if (el.settingsEmail) el.settingsEmail.value = "";
    if (el.settingsEmailConfirm) el.settingsEmailConfirm.value = "";
    if (!updated?.pendingEmailConfirmation && el.settingsCurrentEmailDisplay) {
      el.settingsCurrentEmailDisplay.value = email;
    }
    setAuthHint(updated?.pendingEmailConfirmation
      ? "Check your email and confirm the change to finish updating your address."
      : "Email saved. You can sign in with it now.");
    await refreshCurrentUser();
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
  }
}

async function refreshCurrentUser() {
  const session = await ensureSession();
  if (!session?.access_token) return;
  const currentUser = await apiRequest("/auth/me", {
    method: "GET",
    headers: authHeaders(session)
  });
  if (!currentUser?.user && !currentUser?.id) return;
  applyUpdatedUser(currentUser?.user || currentUser);
}

async function savePassword() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }

  const currentPassword = String(el.settingsCurrentPassword?.value || "");
  const password = String(el.settingsPassword?.value || "");
  const confirm = String(el.settingsPasswordConfirm?.value || "");
  if (!state.passwordRecoveryMode && !isValidPassword(currentPassword)) {
    setAuthHint("Enter your old password first.");
    return;
  }
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
      body: {
        currentPassword,
        password,
        recovery: state.passwordRecoveryMode === true
      }
    });
    applyUpdatedUser(updated?.user || updated);
    state.passwordRecoveryMode = false;
    if (el.settingsCurrentPassword) el.settingsCurrentPassword.value = "";
    if (el.settingsPassword) el.settingsPassword.value = "";
    if (el.settingsPasswordConfirm) el.settingsPasswordConfirm.value = "";
    setAuthHint("Password updated.");
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
  }
}

async function deleteAccount() {
  if (!state.session?.user) {
    setAuthHint("Sign in first.");
    return;
  }
  if (String(el.settingsDeleteConfirm?.value || "").trim() !== "DELETE") {
    setAuthHint("Type DELETE to confirm account deletion.");
    return;
  }
  try {
    const session = await ensureSession();
    if (!session) {
      setAuthHint("Sign in again to delete your account.");
      return;
    }
    await apiRequest("/auth/delete", {
      method: "POST",
      headers: authHeaders(session)
    });
    clearUserLocalData(session);
    clearStoredSession();
    state.session = null;
    syncProgressState();
    syncBookmarksState();
    syncNotificationReadState();
    renderAuthUI();
    window.location.href = "./index.html";
  } catch (error) {
    setAuthHint(getUserFriendlyError(error));
  }
}

function clearUserLocalData(session) {
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) return;
  [
    `cinerune:progress:user:${userId}`,
    `cinerune:bookmarks:user:${userId}`,
    `cinerune:notification-read:user:${userId}`
  ].forEach((key) => localStorage.removeItem(key));
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

async function hydrateSessionFromHash() {
  const accessToken = startupHash.get("access_token");
  const refreshToken = startupHash.get("refresh_token");
  if (!accessToken) return;

  const expiresIn = Number(startupHash.get("expires_in") || 3600);
  const expiresAt = Number(startupHash.get("expires_at") || Math.floor(Date.now() / 1000) + expiresIn);
  const tokenType = startupHash.get("token_type") || "bearer";
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken || "",
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: tokenType,
    user: null
  };

  state.passwordRecoveryMode = startupRecoveryMode;
  setStoredSession(session);
  try {
    const currentUser = await apiRequest("/auth/me", {
      method: "GET",
      headers: authHeaders(session)
    });
    state.session = {
      ...session,
      user: currentUser?.user || currentUser || null
    };
    setStoredSession(state.session);
    renderAuthUI();
  } catch {
    state.session = session;
  }

  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

function onAuthEnter(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (authModalMode === "signup") {
    signUp();
  } else if (authModalMode === "settings") {
    const target = event.target;
    if (target === el.settingsPassword || target === el.settingsPasswordConfirm || target === el.settingsCurrentPassword) {
      savePassword();
    } else if (target === el.settingsEmail || target === el.settingsEmailConfirm) {
      saveEmail();
    } else {
      saveUsername();
    }
  } else if (el.authAddEmailView && !el.authAddEmailView.hasAttribute("hidden")) {
    addEmail();
  } else {
    signIn();
  }
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

function normalizeEmail(value, allowBlank = false) {
  const trimmed = sanitizeText(value, INPUT_LIMITS.emailMax).toLowerCase();
  if (!trimmed) return allowBlank ? "" : null;
  return /.+@.+\..+/.test(trimmed) ? trimmed : null;
}

function displayEmail(value) {
  const email = normalizeEmail(value || "", true);
  if (!email || email.endsWith("@cinerune.user") || email.endsWith("@users.cinerune.app")) return "";
  return email;
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= INPUT_LIMITS.passwordMax;
}

function normalizeAvatarId(value) {
  const legacyMap = {
    naruto: "ironman",
    spider: "darthvader",
    eren: "tonysoprano"
  };
  const mapped = legacyMap[value] || value;
  const fallback = avatarOptions[0]?.id || "none";
  return avatarOptions.some((option) => option.id === mapped) ? mapped : fallback;
}

function renderAvatarPickers() {
  const containers = [el.avatarPicker, el.signedInAvatarPicker].filter(Boolean);
  if (!containers.length) return;

  const activeId = normalizeAvatarId(selectedAvatarId);
  containers.forEach((container) => {
    container.innerHTML = avatarOptions.map((avatar) => `
      <button class="avatar-option${avatar.id === activeId ? " active" : ""}" type="button" data-avatar="${avatar.id}" aria-label="Select ${avatar.label} avatar">
        <img class="avatar-preview" src="${avatarImageSrc(avatar)}" alt="" aria-hidden="true" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        <span>${escapeHtml(avatar.label)}</span>
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
  el.accountAvatar.referrerPolicy = "no-referrer";
  el.accountAvatar.onerror = () => {
    el.accountAvatar.onerror = null;
    el.accountAvatar.src = avatarDataUri(avatar);
  };
  el.accountAvatar.src = avatarImageSrc(avatar);
  el.accountAvatar.alt = `${avatar.label} avatar`;
}

function renderAccountButton(avatarId, label) {
  const session = label === "Login"
    ? null
    : {
        user: {
          user_metadata: {
            avatarId: normalizeAvatarId(avatarId),
            username: label
          }
        }
      };
  renderSharedAccount(el.authAvatarThumb, el.authButtonLabel, session);
}

function avatarImageSrc(avatar) {
  return avatar?.src || avatarDataUri(avatar);
}

async function persistAvatarChoice(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  const previous = normalizeAvatarId(state.session?.user?.user_metadata?.avatarId || selectedAvatarId);
  selectedAvatarId = normalized;
  localStorage.setItem("cinerune:avatar-choice", JSON.stringify(normalized));
  renderAvatarPickers();
  renderActiveAvatar(normalized);
  if (state.session?.user) renderAccountButton(normalized, "Account");

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
    setAuthHint("Avatar updated.");
  } catch (error) {
    selectedAvatarId = previous;
    localStorage.setItem("cinerune:avatar-choice", JSON.stringify(previous));
    renderAvatarPickers();
    renderActiveAvatar(previous);
    renderAccountButton(previous, state.session?.user ? "Account" : "Login");
    setAuthHint(getUserFriendlyError(error));
  }
}

function toggleAccountMenu(forceOpen) {
  if (!el.accountMenu) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : el.accountMenu.hasAttribute("hidden");
  if (shouldOpen) {
    el.accountMenu.removeAttribute("hidden");
    el.toggleAuth?.classList.add("active");
    updateMenuScrimVisibility();
  } else {
    closeAccountMenu();
  }
}

function closeAccountMenu() {
  if (!el.accountMenu) return;
  el.accountMenu.setAttribute("hidden", "");
  el.toggleAuth?.classList.remove("active");
  updateMenuScrimVisibility();
}

function getMenuScrim() {
  let scrim = document.getElementById("menuScrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "menuScrim";
    scrim.className = "menu-scrim";
    scrim.setAttribute("hidden", "");
    document.body.appendChild(scrim);
  }
  if (scrim.dataset.scrimReady !== "1") {
    scrim.dataset.scrimReady = "1";
    scrim.addEventListener("click", () => {
      closeAccountMenu();
      closeNotificationsMenu();
    });
  }
  return scrim;
}

function updateMenuScrimVisibility() {
  const scrim = getMenuScrim();
  scrim.setAttribute("hidden", "");
}

function openAuthModal(mode = "login") {
  if (!el.authModal) return;
  if (mode === true) mode = "settings";
  if (mode === false) mode = "login";
  authModalMode = mode === "settings" || mode === "signup" ? mode : "login";
  closeSettingsPanels();
  el.authModal.removeAttribute("hidden");
  renderAuthUI();
}

function showAuthView(view) {
  // Show a specific auth view without updating authModalMode
  if (view === "login") {
    el.authLoginView?.removeAttribute("hidden");
    el.authSignupView?.setAttribute("hidden", "");
    el.authAddEmailView?.setAttribute("hidden", "");
  } else if (view === "signup") {
    el.authLoginView?.setAttribute("hidden", "");
    el.authSignupView?.removeAttribute("hidden");
    el.authAddEmailView?.setAttribute("hidden", "");
  } else if (view === "addEmail") {
    el.authLoginView?.setAttribute("hidden", "");
    el.authSignupView?.setAttribute("hidden", "");
    el.authAddEmailView?.removeAttribute("hidden");
  }
}

async function syncProgressToCloud() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

  const rows = dedupeProgressRows(Object.values(state.progress))
    .filter((entry) => shouldSyncProgressEntry(entry))
    .filter((entry) => {
      const deletedAt = Number(state.deletedProgressMap?.[`${entry.mediaType}:${entry.id}:${entry.season || 1}:${entry.episode || 1}`] || 0);
      return !deletedAt || Number(entry.updatedAt || 0) > deletedAt;
    })
    .slice(0, 240)
    .map((entry) => ({
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
    for (let index = 0; index < rows.length; index += 15) {
      await apiRequest("/progress/push", {
        method: "POST",
        headers: authHeaders(session),
        body: { rows: rows.slice(index, index + 15) }
      });
    }
  } catch {
    setStatus("Could not save progress right now.");
    return;
  }

  state.lastSyncAt = Date.now();
}

function shouldSyncProgressEntry(entry) {
  const progress = Number(entry?.progress || 0);
  const timestamp = Number(entry?.timestamp || 0);
  return progress >= 98 || timestamp > 8 || progress > 1;
}

function dedupeProgressRows(entries) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    const mediaType = entry?.mediaType === "tv" ? "tv" : "movie";
    const id = Number(entry?.id || 0);
    if (!id) return;
    const season = mediaType === "tv" ? Number(entry?.season || 1) : 1;
    const episode = mediaType === "tv" ? Number(entry?.episode || 1) : 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;
    const previous = map.get(key);
    if (!previous || Number(entry?.updatedAt || 0) >= Number(previous?.updatedAt || 0)) {
      map.set(key, {
        ...entry,
        mediaType,
        id,
        season,
        episode
      });
    }
  });
  return [...map.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

async function pullCloudProgress() {
  if (!state.session?.user) return;
  const session = await ensureSession();
  if (!session) return;

  state.lastProgressPullAt = Date.now();

  let data = null;
  try {
    data = await apiRequest("/progress/pull?limit=500", {
      headers: authHeaders(session)
    });
  } catch {
    setStatus("Could not load saved progress.");
    return;
  }

  const pulledAt = Date.now();
  const nextProgress = {};
  (data || []).forEach((row) => {
    const mediaType = row.media_type === "tv" ? "tv" : "movie";
    const id = Number(row.content_id);
    if (!id) return;
    const season = Number(row.season_number) || 1;
    const episode = Number(row.episode_number) || 1;
    const key = `${mediaType}:${id}:${season}:${episode}`;
    const cloudUpdatedAt = Date.parse(row.updated_at || "") || 0;
    if (state.deletedProgressKeys?.has(key) && cloudUpdatedAt <= Number(state.deletedProgressMap?.[key] || 0)) {
      return;
    }

    const entry = {
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
    if (normalizePlaybackTimestamp(entry.timestamp, entry.duration) > 8) {
      nextProgress[key] = entry;
   }
    forgetDeletedProgressEntry(state.session, entry);
    state.deletedProgressMap = readDeletedProgressMap(state.session);
    state.deletedProgressKeys = new Set(Object.keys(state.deletedProgressMap));
  });

  Object.entries(state.progress || {}).forEach(([key, entry]) => {
    if (nextProgress[key]) return;
    if (Number(entry?.updatedAt || 0) > pulledAt) {
      nextProgress[key] = entry;
    }
  });
  state.progress = nextProgress;
  localStorage.setItem(getProgressKey(state.session), JSON.stringify(state.progress));
  await hydrateContinueRow();
  await refreshPersonalizedCollections();
}

async function pullCloudBookmarks() {
  if (!state.session?.user) return;
  try {
    const synced = await syncBookmarksWithCloud(state.session, state.bookmarks);
    state.bookmarks = synced || {};
    localStorage.setItem(getBookmarksKey(state.session), JSON.stringify(state.bookmarks));
    await refreshPersonalizedCollections();
  } catch {
    // Keep current bookmarks if cloud sync is unavailable.
  }
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
  animateHint(el.authHint, message, "auth");
  const tone = hintTone(message);
  if (tone) showToast(message, tone);
}

function hintTone(message) {
  const lowered = String(message || "").toLowerCase();
  if (!lowered) return "";
  const isError = lowered.includes("failed")
    || lowered.includes("do not match")
    || lowered.includes("provide")
    || lowered.includes("enter")
    || lowered.includes("wrong")
    || lowered.includes("invalid")
    || lowered.includes("already")
    || lowered.includes("too many")
    || lowered.includes("not found")
    || lowered.includes("incorrect")
    || lowered.includes("unavailable");
  if (isError) return "error";
  const isSuccess = lowered.includes("signed in")
    || lowered.includes("signed out")
    || lowered.includes("saved")
    || lowered.includes("updated")
    || lowered.includes("sent")
    || lowered.includes("created")
    || lowered.includes("confirmed")
    || lowered.includes("check your email");
  return isSuccess ? "success" : "";
}

function animateHint(node, message, scope) {
  if (!node) return;
  const lowered = String(message || "").toLowerCase();
  const isError = lowered.includes("failed")
    || lowered.includes("do not match")
    || lowered.includes("provide")
    || lowered.includes("enter")
    || lowered.includes("wrong")
    || lowered.includes("invalid")
    || lowered.includes("already")
    || lowered.includes("too many")
    || lowered.includes("not found")
    || lowered.includes("incorrect");
  const isSuccess = lowered.includes("signed in")
    || lowered.includes("signed out")
    || lowered.includes("saved")
    || lowered.includes("updated")
    || lowered.includes("sent")
    || lowered.includes("created")
    || lowered.includes("check your email");
  const className = isError ? `${scope}-hint-error` : (isSuccess ? `${scope}-hint-success` : `${scope}-hint-flash`);
  node.classList.remove(`${scope}-hint-flash`, `${scope}-hint-success`, `${scope}-hint-error`);
  void node.offsetWidth;
  node.classList.add(className);
  const timerKey = `${scope}HintTimer`;
  window.clearTimeout(animateHint[timerKey]);
  animateHint[timerKey] = window.setTimeout(() => {
    node.classList.remove(`${scope}-hint-flash`, `${scope}-hint-success`, `${scope}-hint-error`);
  }, 760);
  if (isError) nudgeAuthCard();
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

function countryFlagMarkup(code) {
  const normalized = String(code || "").trim().toLowerCase();
  const mapped = normalizeCountryFlagCode(normalized);
  if (!mapped) return "";
  const src = mapped.includes("-")
    ? `https://flagcdn.com/${mapped}.svg`
    : `https://flagcdn.com/24x18/${mapped}.png`;
  return `<img class="country-flag-image" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
}

function normalizeCountryFlagCode(code) {
  const value = String(code || "").trim().toLowerCase();
  if (!value) return "";
  const aliases = {
    uk: "gb",
    tp: "tl",
    yu: "rs",
    zr: "cd",
    dd: "de",
    fx: "fr",
    cs: "cz",
    xc: "cz",
    xi: "gb-nir",
    su: "ru",
    an: "nl",
    bu: "mm"
  };
  const mapped = aliases[value] || value;
  return /^[a-z]{2}(?:-[a-z]{3})?$/.test(mapped) ? mapped : "";
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

function avatarDataUri(avatar) {
  if (avatar?.id === "none") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Default profile"><rect width="128" height="128" rx="32" fill="#102035"/><circle cx="64" cy="48" r="23" fill="#6f8aa5"/><path d="M24 112c5-25 21-39 40-39s35 14 40 39" fill="#6f8aa5"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  const safeLabel = escapeHtml(avatar?.label || "Avatar");
  const initials = escapeHtml(String(avatar?.label || "AV").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "AV");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#179de5"/><stop offset="100%" stop-color="#071528"/></linearGradient></defs><rect width="128" height="128" rx="32" fill="url(#g)"/><text x="64" y="73" fill="#e8f1fb" font-family="Arial, sans-serif" font-size="34" font-weight="800" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

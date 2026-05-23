import { apiRequest, authHeaders, clearStoredSession, ensureSession, getStoredSession, refreshStoredSessionUser, setStoredSession } from "./auth-client.js";
import { initHeaderNotifications } from "./notifications.js?v=20260515-bugfix2";
import { searchCatalog } from "./catalog.js?v=20260515-bugfix2";
import { getProgressKey, initConfiguredTmdb, legacyProgressKey } from "./shared-state.js?v=20260515-bugfix2";
import { buildResumableWatchHref, buildWatchHref, debounce, escapeHtml, readJson, sanitizeText } from "./shared-utils.js?v=20260515-bugfix2";
import { showToast } from "./ui-toast.js";

const avatarOptions = [
  { id: "none", label: "No Avatar" },
  { id: "ironman", label: "Iron Man", src: "./avatars/ironman.png" },
  { id: "goku", label: "Goku", src: "./avatars/goku.jpg" },
  { id: "darthvader", label: "Darth Vader", src: "./avatars/darthvader.jpg" },
  { id: "tonysoprano", label: "Tony Soprano", src: "./avatars/tonysoprano.jpg" },
  { id: "luffy", label: "Monkey D. Luffy", src: "./avatars/luffy.jpg" },
  { id: "walterwhite", label: "Walter White", src: "./avatars/walterwhite.jpg" }
];
const recentSearchesKey = "cinerune:recent-searches";
const RECENT_SEARCH_LIMIT = 12;

export function initSharedHeader() {
  const accountWrap = document.getElementById("accountMenuWrap");
  const accountBtn = document.getElementById("toggleAuth");
  const accountMenu = document.getElementById("accountMenu");
  const avatar = document.getElementById("authAvatarThumb");
  const label = document.getElementById("authButtonLabel");
  const signOut = document.getElementById("signOutMenuBtn");
  const notificationsWrap = document.getElementById("notificationsWrap");
  let currentSession = getStoredSession();
  let currentProgress = readJson(getProgressKey(null), readJson(legacyProgressKey, {})) || {};
  let lastSessionRefreshAt = 0;

  sharedHeaderRefs.avatar = avatar;
  sharedHeaderRefs.label = label;

  ensureAccountMenuIcons(accountMenu);
  ensureSharedReportMenuItem(accountMenu, () => currentSession);
  bindSettingsMenu(accountMenu, () => currentSession);
  const headerActions = ensureHeaderActionsGroup();
  const bookmarksLink = ensureBookmarksLink(headerActions || notificationsWrap || accountWrap);

  initSharedNavSearch({ getProgress: () => currentProgress });
  initSharedFooterReport(() => currentSession);
  renderSharedAccount(avatar, label, currentSession);
  updateBookmarksLink(bookmarksLink, currentSession);
  notificationsWrap?.toggleAttribute("hidden", !currentSession?.user);

  refreshStoredSessionUser().then((session) => {
    currentSession = session;
    currentProgress = readJson(getProgressKey(session), {}) || {};
    renderSharedAccount(avatar, label, session);
    updateBookmarksLink(bookmarksLink, session);
  }).catch(() => {
    currentSession = null;
    renderSharedAccount(avatar, label, null);
    updateBookmarksLink(bookmarksLink, null);
  });
  window.addEventListener("cinerune:session-updated", (event) => {
    currentSession = event.detail || null;
    currentProgress = readJson(getProgressKey(currentSession), {}) || {};
    renderSharedAccount(avatar, label, currentSession);
    updateBookmarksLink(bookmarksLink, currentSession);
    notificationsWrap?.toggleAttribute("hidden", !currentSession?.user);
    if (currentSession?.user) void initHeaderNotifications();
  });

  const refreshCloudSession = () => {
    if (!currentSession?.user || document.visibilityState !== "visible") return;
    if (Date.now() - lastSessionRefreshAt < 30000) return;
    lastSessionRefreshAt = Date.now();
    void refreshStoredSessionUser().catch(() => {});
  };
  window.addEventListener("focus", refreshCloudSession);
  document.addEventListener("visibilitychange", refreshCloudSession);

  accountBtn?.addEventListener("click", async () => {
    if (!currentSession) {
      try {
        currentSession = await refreshStoredSessionUser();
        renderSharedAccount(avatar, label, currentSession);
      } catch {
        currentSession = null;
      }
    }
    if (!currentSession?.user) {
      openSharedAuthModal("login");
      return;
    }
    if (!accountMenu) {
      openSharedAuthModal("login");
      return;
    }
    const hidden = accountMenu.hasAttribute("hidden");
    if (hidden) {
      accountMenu.removeAttribute("hidden");
      accountBtn.classList.add("active");
      updateMenuScrimVisibility();
    } else {
      accountMenu.setAttribute("hidden", "");
      accountBtn.classList.remove("active");
      updateMenuScrimVisibility();
    }
  });

  signOut?.addEventListener("click", async () => {
    await signOutSharedSession();
    currentSession = null;
    updateBookmarksLink(bookmarksLink, null);
    accountMenu?.setAttribute("hidden", "");
    document.getElementById("notificationsWrap")?.setAttribute("hidden", "");
  });

  document.addEventListener("click", (event) => {
    if (accountWrap && !accountWrap.contains(event.target)) {
      accountMenu?.setAttribute("hidden", "");
      accountBtn?.classList.remove("active");
      updateMenuScrimVisibility();
    }
  });

  initHeaderNotifications();
}

export function getSharedRecentSearches() {
  const entries = readJson(recentSearchesKey, []);
  return Array.isArray(entries)
    ? entries.map((entry) => sanitizeText(entry, 80)).filter(Boolean).slice(0, RECENT_SEARCH_LIMIT)
    : [];
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
      const accountMenu = document.getElementById("accountMenu");
      const accountBtn = document.getElementById("toggleAuth");
      accountMenu?.setAttribute("hidden", "");
      accountBtn?.classList.remove("active");
      const notificationsMenu = document.getElementById("notificationsMenu");
      const notificationsBtn = document.getElementById("notificationsBtn");
      notificationsMenu?.setAttribute("hidden", "");
      notificationsBtn?.setAttribute("aria-expanded", "false");
      updateMenuScrimVisibility();
    });
  }
  return scrim;
}

function updateMenuScrimVisibility() {
  const scrim = getMenuScrim();
  scrim.setAttribute("hidden", "");
}

const sharedAuthState = {
  modal: null,
  hint: null,
  mode: "login"
};

export function openSharedAuthModal(mode = "login") {
  initSharedAuthModal();
  sharedAuthState.mode = mode === "signup" ? "signup" : "login";
  renderSharedAuthMode();
  sharedAuthState.modal?.removeAttribute("hidden");
}

function initSharedAuthModal() {
  if (sharedAuthState.modal) return;
  const modal = document.createElement("section");
  modal.className = "auth-modal";
  modal.id = "sharedAuthModal";
  modal.setAttribute("hidden", "");
  modal.innerHTML = `
    <div class="auth-backdrop" data-shared-auth-close></div>
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="sharedAuthTitle">
      <button class="auth-close" type="button" data-shared-auth-close aria-label="Close account dialog">x</button>
      <div class="auth-mode-switch" role="tablist" aria-label="Account mode">
        <button id="sharedLoginTab" class="auth-mode-btn active" type="button">Sign In</button>
        <button id="sharedSignupTab" class="auth-mode-btn" type="button">Create Account</button>
      </div>
      <div id="sharedLoginView" class="account-grid">
        <h2 id="sharedAuthTitle">Sign In</h2>
        <label>
          <span>Username or Email</span>
          <input id="sharedAuthIdentifier" type="text" placeholder="username or email" maxlength="80" autocomplete="username" />
        </label>
        <label>
          <span>Password</span>
          <input id="sharedAuthPassword" type="password" placeholder="your password" maxlength="128" autocomplete="current-password" />
        </label>
        <div class="account-actions">
          <button id="sharedSignInBtn" class="pill-btn" type="button">Sign In</button>
        </div>
      </div>
      <div id="sharedSignupView" class="account-grid" hidden>
        <h2>Create Account</h2>
        <div class="signup-field-group">
          <label>
            <span>Username</span>
            <input id="sharedSignupUsername" type="text" placeholder="pick a username" maxlength="24" autocomplete="username" />
          </label>
        </div>
        <div class="signup-field-group">
          <label>
            <span>Email <em>optional</em></span>
            <input id="sharedSignupEmail" type="email" placeholder="you@example.com" maxlength="80" autocomplete="email" />
          </label>
          <label>
            <span>Confirm Email <em>optional</em></span>
            <input id="sharedSignupEmailConfirm" type="email" placeholder="re-enter your email" maxlength="80" autocomplete="email" />
          </label>
        </div>
        <div class="signup-field-group">
          <label>
            <span>Password</span>
            <input id="sharedSignupPassword" type="password" placeholder="create a password" maxlength="128" autocomplete="new-password" />
          </label>
          <label>
            <span>Confirm Password</span>
            <input id="sharedSignupConfirm" type="password" placeholder="re-enter your password" maxlength="128" autocomplete="new-password" />
          </label>
        </div>
        <div class="account-actions">
          <button id="sharedSignUpBtn" class="pill-btn" type="button">Create Account</button>
        </div>
      </div>
      <p id="sharedAuthHint" class="tiny muted"></p>
    </div>
  `;
  document.body.appendChild(modal);
  sharedAuthState.modal = modal;
  sharedAuthState.hint = modal.querySelector("#sharedAuthHint");
  modal.querySelectorAll("[data-shared-auth-close]").forEach((node) => {
    node.addEventListener("click", closeSharedAuthModal);
  });
  modal.querySelector("#sharedLoginTab")?.addEventListener("click", () => {
    sharedAuthState.mode = "login";
    renderSharedAuthMode();
  });
  modal.querySelector("#sharedSignupTab")?.addEventListener("click", () => {
    sharedAuthState.mode = "signup";
    renderSharedAuthMode();
  });
  modal.querySelector("#sharedSignInBtn")?.addEventListener("click", signInSharedAuth);
  modal.querySelector("#sharedSignUpBtn")?.addEventListener("click", signUpSharedAuth);
  modal.querySelectorAll("input").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (sharedAuthState.mode === "signup") {
        void signUpSharedAuth();
      } else {
        void signInSharedAuth();
      }
    });
  });
}

function renderSharedAuthMode() {
  const loginMode = sharedAuthState.mode !== "signup";
  const modal = sharedAuthState.modal;
  modal?.querySelector("#sharedLoginTab")?.classList.toggle("active", loginMode);
  modal?.querySelector("#sharedSignupTab")?.classList.toggle("active", !loginMode);
  modal?.querySelector("#sharedLoginView")?.toggleAttribute("hidden", !loginMode);
  modal?.querySelector("#sharedSignupView")?.toggleAttribute("hidden", loginMode);
  setSharedAuthHint("");
}

function closeSharedAuthModal() {
  sharedAuthState.modal?.setAttribute("hidden", "");
}

async function signInSharedAuth() {
  const modal = sharedAuthState.modal;
  const identifier = normalizeIdentifier(modal?.querySelector("#sharedAuthIdentifier")?.value || "");
  const password = String(modal?.querySelector("#sharedAuthPassword")?.value || "");
  if (!identifier || !isValidPassword(password)) {
    setSharedAuthHint("Enter a valid username/email and password.");
    return;
  }
  try {
    const session = await apiRequest("/auth/login", {
      method: "POST",
      body: { identifier, password }
    });
    if (!session?.access_token) {
      setSharedAuthHint("Username/email or password is wrong. Try again.");
      return;
    }
    setStoredSession(session);
    closeSharedAuthModal();
    showToast("Signed in.", "success");
  } catch {
    setSharedAuthHint("Username/email or password is wrong. Try again.");
  }
}

async function signUpSharedAuth() {
  const modal = sharedAuthState.modal;
  const username = normalizeUsername(modal?.querySelector("#sharedSignupUsername")?.value || "");
  const email = normalizeEmail(modal?.querySelector("#sharedSignupEmail")?.value || "", true);
  const emailConfirm = normalizeEmail(modal?.querySelector("#sharedSignupEmailConfirm")?.value || "", true);
  const password = String(modal?.querySelector("#sharedSignupPassword")?.value || "");
  const confirm = String(modal?.querySelector("#sharedSignupConfirm")?.value || "");
  if (!username || !isValidPassword(password)) {
    setSharedAuthHint("Provide a username and a password with 6+ characters.");
    return;
  }
  if (email === null || emailConfirm === null) {
    setSharedAuthHint("Enter a valid email address or leave both blank.");
    return;
  }
  if ((email || emailConfirm) && email !== emailConfirm) {
    setSharedAuthHint("Emails do not match.");
    return;
  }
  if (password !== confirm) {
    setSharedAuthHint("Passwords do not match.");
    return;
  }
  try {
    await apiRequest("/auth/signup", {
      method: "POST",
      body: { username, email: email || undefined, password, avatarId: "none" }
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
      setSharedAuthHint(email
        ? "Account created. Check your email if confirmation is required, then sign in."
        : "Account created. Sign in with your username and password.");
      sharedAuthState.mode = "login";
      renderSharedAuthMode();
      return;
    }
    setStoredSession(session);
    closeSharedAuthModal();
    showToast("Account created.", "success");
  } catch (error) {
    setSharedAuthHint(getSharedFriendlyError(error));
  }
}

function setSharedAuthHint(message) {
  if (sharedAuthState.hint) sharedAuthState.hint.textContent = message;
  const tone = sharedHintTone(message);
  if (tone) showToast(message, tone);
}

export function openSettingsModal(panelName) {
  initSharedSettingsModal();
  void openSharedSettingsModal(panelName);
}

const sharedHeaderRefs = {
  avatar: null,
  label: null
};

const settingsModalState = {
  modal: null,
  backdrop: null,
  closeBtn: null,
  hint: null,
  signedInHint: null,
  accountAvatar: null,
  authUserEmail: null,
  signOutBtn: null,
  deleteAccount: null,
  deleteConfirm: null,
  username: null,
  usernameConfirm: null,
  currentUsernameDisplay: null,
  email: null,
  emailConfirm: null,
  currentEmailDisplay: null,
  currentPassword: null,
  password: null,
  confirm: null,
  saveUsername: null,
  saveEmail: null,
  savePassword: null,
  avatarPicker: null,
  actionToggles: [],
  session: null
};

function bindSettingsMenu(menu, getSession) {
  if (!menu) return;
  initSharedSettingsModal();
  const settingsItem = [...menu.querySelectorAll(".account-menu-item")].find((item) =>
    String(item.textContent || "").trim().toLowerCase() === "settings"
  );
  if (!settingsItem) return;
  settingsItem.addEventListener("click", async (event) => {
    event.preventDefault();
    menu.setAttribute("hidden", "");
    const accountButton = menu.closest(".account-menu-wrap")?.querySelector("button");
    accountButton?.classList.remove("active");
    accountButton?.setAttribute("aria-expanded", "false");
    updateMenuScrimVisibility();
    let session = null;
    try {
      session = await ensureSession();
    } catch {
      session = null;
    }
    if (!session?.user) {
      openSharedAuthModal("login");
      return;
    }
    settingsModalState.session = session;
    await openSharedSettingsModal();
  });
}

function initSharedSettingsModal() {
  if (settingsModalState.modal) return;
  const modal = document.createElement("section");
  modal.className = "auth-modal";
  modal.id = "sharedSettingsModal";
  modal.setAttribute("hidden", "");
  modal.innerHTML = `
    <div class="auth-backdrop" data-settings-backdrop></div>
    <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="sharedSettingsTitle">
      <button class="auth-close" type="button" data-settings-close aria-label="Close settings">x</button>
      <div class="account-grid">
        <div class="settings-hero">
          <img id="sharedAccountAvatar" class="account-avatar" alt="Selected avatar" />
          <div>
            <p class="settings-kicker">Account Settings</p>
            <h2 id="sharedSettingsTitle">Profile and Security</h2>
            <p class="tiny">Signed in as <strong id="sharedAuthUserEmail">-</strong></p>
            <p id="sharedSignedInHint" class="tiny muted">You are signed in.</p>
          </div>
        </div>
        <div class="account-actions">
          <button id="sharedSignOutBtn" class="pill-btn ghost" type="button">Sign Out</button>
        </div>

        <div class="settings-action-list">
          <button class="settings-action-toggle" type="button" data-settings-toggle="username" aria-expanded="false">
            <span>
              <strong>Change Username</strong>
              <small>Update the name you use to sign in.</small>
            </span>
            <span class="settings-action-icon" aria-hidden="true">+</span>
          </button>
          <div class="settings-section" data-settings-panel="username" hidden>
            <label>
              <span>Current Username</span>
              <input id="sharedCurrentUsernameDisplay" type="text" readonly />
            </label>
            <label>
              <span>New Username</span>
              <input id="sharedSettingsUsername" type="text" placeholder="new username" maxlength="24" autocomplete="username" />
            </label>
            <label>
              <span>Confirm New Username</span>
              <input id="sharedSettingsUsernameConfirm" type="text" placeholder="re-enter new username" maxlength="24" autocomplete="username" />
            </label>
            <div class="account-actions">
              <button id="sharedSaveUsername" class="pill-btn" type="button">Save Username</button>
            </div>
          </div>

          <button class="settings-action-toggle" type="button" data-settings-toggle="email" aria-expanded="false">
            <span>
              <strong>Add Email</strong>
              <small>Optional login backup if you forget your username.</small>
            </span>
            <span class="settings-action-icon" aria-hidden="true">+</span>
          </button>
          <div class="settings-section" data-settings-panel="email" hidden>
            <label>
              <span>Current Email</span>
              <input id="sharedCurrentEmailDisplay" type="email" readonly />
            </label>
            <label>
              <span>New Email Address</span>
              <input id="sharedSettingsEmail" type="email" placeholder="you@example.com" maxlength="80" autocomplete="email" />
            </label>
            <label>
              <span>Confirm New Email</span>
              <input id="sharedSettingsEmailConfirm" type="email" placeholder="re-enter your email" maxlength="80" autocomplete="email" />
            </label>
            <div class="account-actions">
              <button id="sharedSaveEmail" class="pill-btn" type="button">Save Email</button>
            </div>
          </div>

          <button class="settings-action-toggle" type="button" data-settings-toggle="password" aria-expanded="false">
            <span>
              <strong>Change Password</strong>
              <small>Old password required, new password entered twice.</small>
            </span>
            <span class="settings-action-icon" aria-hidden="true">+</span>
          </button>
          <div class="settings-section" data-settings-panel="password" hidden>
            <label>
              <span>Old Password</span>
              <input id="sharedSettingsCurrentPassword" type="password" placeholder="current password" maxlength="128" autocomplete="off" />
            </label>
            <label>
              <span>New Password</span>
              <input id="sharedSettingsPassword" type="password" placeholder="new password" maxlength="128" autocomplete="new-password" />
            </label>
            <label>
              <span>Confirm New Password</span>
              <input id="sharedSettingsPasswordConfirm" type="password" placeholder="re-enter new password" maxlength="128" autocomplete="new-password" />
            </label>
            <div class="account-actions">
              <button id="sharedSavePassword" class="pill-btn" type="button">Update Password</button>
            </div>
          </div>

          <button class="settings-action-toggle" type="button" data-settings-toggle="avatar" aria-expanded="false">
            <span>
              <strong>Change Avatar</strong>
              <small>Pick a character image for your profile.</small>
            </span>
            <span class="settings-action-icon" aria-hidden="true">+</span>
          </button>
          <div class="avatar-picker-block compact" data-settings-panel="avatar" hidden>
            <div class="row-head compact">
              <h3>Change Avatar</h3>
            </div>
            <div id="sharedAvatarPicker" class="avatar-picker" aria-label="Avatar choices"></div>
          </div>

          <button class="settings-action-toggle danger" type="button" data-settings-toggle="delete" aria-expanded="false">
            <span>
              <strong>Delete Account</strong>
              <small>Permanently remove your account and saved progress.</small>
            </span>
            <span class="settings-action-icon" aria-hidden="true">+</span>
          </button>
          <div class="settings-section danger-zone" data-settings-panel="delete" hidden>
            <label>
              <span>Type DELETE to confirm</span>
              <input id="sharedDeleteConfirm" type="text" placeholder="DELETE" maxlength="12" autocomplete="off" />
            </label>
            <div class="account-actions">
              <button id="sharedDeleteAccount" class="pill-btn danger" type="button">Delete Account</button>
            </div>
          </div>
        </div>

        <p id="sharedSettingsHint" class="tiny muted"></p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  settingsModalState.modal = modal;
  settingsModalState.backdrop = modal.querySelector("[data-settings-backdrop]");
  settingsModalState.closeBtn = modal.querySelector("[data-settings-close]");
  settingsModalState.hint = modal.querySelector("#sharedSettingsHint");
  settingsModalState.signedInHint = modal.querySelector("#sharedSignedInHint");
  settingsModalState.accountAvatar = modal.querySelector("#sharedAccountAvatar");
  settingsModalState.authUserEmail = modal.querySelector("#sharedAuthUserEmail");
  settingsModalState.signOutBtn = modal.querySelector("#sharedSignOutBtn");
  settingsModalState.deleteAccount = modal.querySelector("#sharedDeleteAccount");
  settingsModalState.deleteConfirm = modal.querySelector("#sharedDeleteConfirm");
  settingsModalState.username = modal.querySelector("#sharedSettingsUsername");
  settingsModalState.usernameConfirm = modal.querySelector("#sharedSettingsUsernameConfirm");
  settingsModalState.currentUsernameDisplay = modal.querySelector("#sharedCurrentUsernameDisplay");
  settingsModalState.email = modal.querySelector("#sharedSettingsEmail");
  settingsModalState.emailConfirm = modal.querySelector("#sharedSettingsEmailConfirm");
  settingsModalState.currentEmailDisplay = modal.querySelector("#sharedCurrentEmailDisplay");
  settingsModalState.currentPassword = modal.querySelector("#sharedSettingsCurrentPassword");
  settingsModalState.password = modal.querySelector("#sharedSettingsPassword");
  settingsModalState.confirm = modal.querySelector("#sharedSettingsPasswordConfirm");
  settingsModalState.saveUsername = modal.querySelector("#sharedSaveUsername");
  settingsModalState.saveEmail = modal.querySelector("#sharedSaveEmail");
  settingsModalState.savePassword = modal.querySelector("#sharedSavePassword");
  settingsModalState.avatarPicker = modal.querySelector("#sharedAvatarPicker");
  settingsModalState.actionToggles = [...modal.querySelectorAll("[data-settings-toggle]")];

  settingsModalState.backdrop?.addEventListener("click", closeSharedSettingsModal);
  settingsModalState.closeBtn?.addEventListener("click", closeSharedSettingsModal);
  settingsModalState.saveUsername?.addEventListener("click", saveSharedUsername);
  settingsModalState.saveEmail?.addEventListener("click", saveSharedEmail);
  settingsModalState.savePassword?.addEventListener("click", saveSharedPassword);
  settingsModalState.deleteAccount?.addEventListener("click", deleteSharedAccount);
  settingsModalState.signOutBtn?.addEventListener("click", signOutSharedSession);
  settingsModalState.actionToggles.forEach((button) => {
    button.addEventListener("click", () => toggleSharedSettingsPanel(button.dataset.settingsToggle));
  });
}

async function openSharedSettingsModal(initialPanelName) {
  if (!settingsModalState.modal) return;
  let session = settingsModalState.session || null;
  if (!session?.user) {
    try {
      session = await ensureSession();
    } catch {
      session = null;
    }
  }
  if (!session?.user) {
    openSharedAuthModal("login");
    return;
  }
  settingsModalState.session = session;
  settingsModalState.modal.removeAttribute("hidden");
  const meta = session.user.user_metadata || {};
  if (settingsModalState.currentUsernameDisplay) settingsModalState.currentUsernameDisplay.value = meta.username || "";
  if (settingsModalState.username) settingsModalState.username.value = "";
  if (settingsModalState.usernameConfirm) settingsModalState.usernameConfirm.value = "";
  if (settingsModalState.currentEmailDisplay) settingsModalState.currentEmailDisplay.value = displayEmail(session.user.email) || "No email added";
  if (settingsModalState.email) settingsModalState.email.value = "";
  if (settingsModalState.emailConfirm) settingsModalState.emailConfirm.value = "";
  if (settingsModalState.deleteConfirm) settingsModalState.deleteConfirm.value = "";
  updateSharedEmailSettingsLabels(session);
  if (settingsModalState.authUserEmail) {
    settingsModalState.authUserEmail.textContent = meta.username
      || displayEmail(session.user.email)
      || "Account";
  }
  if (settingsModalState.accountAvatar) {
    const avatarId = normalizeAvatarId(meta.avatarId || "none");
    settingsModalState.accountAvatar.referrerPolicy = "no-referrer";
    settingsModalState.accountAvatar.onerror = () => {
      settingsModalState.accountAvatar.onerror = null;
      settingsModalState.accountAvatar.src = avatarDataUri({ id: avatarId, label: "Avatar" });
    };
    settingsModalState.accountAvatar.src = avatarSrcById(avatarId);
  }
  renderSharedAvatarPicker(meta.avatarId || "none");
  closeSharedSettingsPanels();
  if (initialPanelName) {
    toggleSharedSettingsPanel(initialPanelName);
  }
  setSharedSettingsHint("");
}

function closeSharedSettingsModal() {
  if (!settingsModalState.modal) return;
  settingsModalState.modal.setAttribute("hidden", "");
}

function updateSharedEmailSettingsLabels(session) {
  const hasPublicEmail = Boolean(displayEmail(session?.user?.email || ""));
  settingsModalState.modal?.querySelectorAll('[data-settings-toggle="email"] strong').forEach((node) => {
    node.textContent = hasPublicEmail ? "Change Email" : "Add Email";
  });
  settingsModalState.modal?.querySelectorAll('[data-settings-toggle="email"] small').forEach((node) => {
    node.textContent = hasPublicEmail
      ? "Update the email used for login and password reset."
      : "Add a login backup and password reset address.";
  });
  if (settingsModalState.saveEmail) {
    settingsModalState.saveEmail.textContent = hasPublicEmail ? "Change Email" : "Save Email";
  }
}

function toggleSharedSettingsPanel(panelName) {
  if (!panelName || !settingsModalState.modal) return;
  const targetPanel = settingsModalState.modal.querySelector(`[data-settings-panel="${cssEscape(panelName)}"]`);
  const targetButton = settingsModalState.modal.querySelector(`[data-settings-toggle="${cssEscape(panelName)}"]`);
  if (!targetPanel || !targetButton) return;
  const willOpen = targetPanel.hasAttribute("hidden");
  closeSharedSettingsPanels();
  if (willOpen) {
    targetPanel.removeAttribute("hidden");
    targetButton.setAttribute("aria-expanded", "true");
  }
}

function closeSharedSettingsPanels() {
  if (!settingsModalState.modal) return;
  settingsModalState.modal.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.setAttribute("hidden", "");
  });
  settingsModalState.modal.querySelectorAll("[data-settings-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function renderSharedAvatarPicker(activeId) {
  if (!settingsModalState.avatarPicker) return;
  const normalized = normalizeAvatarId(activeId);
  settingsModalState.avatarPicker.innerHTML = avatarOptions.map((avatar) => `
    <button class="avatar-option${avatar.id === normalized ? " active" : ""}" type="button" data-avatar="${avatar.id}" aria-label="Select ${escapeHtml(avatar.label)} avatar">
      <img class="avatar-preview" src="${avatarSrcById(avatar.id)}" alt="" aria-hidden="true" loading="eager" decoding="async" referrerpolicy="no-referrer" />
      <span>${escapeHtml(avatar.label)}</span>
    </button>
  `).join("");

  [...settingsModalState.avatarPicker.querySelectorAll(".avatar-option")].forEach((node) => {
    node.addEventListener("click", () => {
      const nextId = normalizeAvatarId(node.dataset.avatar);
      persistSharedAvatarChoice(nextId);
    });
  });
}

async function persistSharedAvatarChoice(avatarId) {
  const normalized = normalizeAvatarId(avatarId);
  const previous = normalizeAvatarId(settingsModalState.session?.user?.user_metadata?.avatarId || readJson("cinerune:avatar-choice", "none"));
  localStorage.setItem("cinerune:avatar-choice", JSON.stringify(normalized));
  if (settingsModalState.accountAvatar) {
    settingsModalState.accountAvatar.src = avatarSrcById(normalized);
    settingsModalState.accountAvatar.alt = `${avatarOptions.find((option) => option.id === normalized)?.label || "Avatar"} avatar`;
  }
  renderSharedAvatarPicker(normalized);
  renderSharedAccount(sharedHeaderRefs.avatar, sharedHeaderRefs.label, {
    ...(settingsModalState.session || {}),
    user: {
      ...(settingsModalState.session?.user || {}),
      user_metadata: {
        ...(settingsModalState.session?.user?.user_metadata || {}),
        avatarId: normalized
      }
    }
  });
  const session = await ensureSession();
  if (!session?.user) return;
  try {
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: {
        avatarId: normalized,
        username: session.user.user_metadata?.username || undefined
      }
    });
    applySharedSessionUpdate(session, updated?.user || updated, { avatarId: normalized });
    if (settingsModalState.accountAvatar) {
      settingsModalState.accountAvatar.src = avatarSrcById(normalized);
    }
    renderSharedAvatarPicker(normalized);
    setSharedSettingsHint("Avatar updated.");
  } catch (error) {
    localStorage.setItem("cinerune:avatar-choice", JSON.stringify(previous));
    renderSharedAvatarPicker(previous);
    if (settingsModalState.accountAvatar) {
      settingsModalState.accountAvatar.src = avatarSrcById(previous);
    }
    renderSharedAccount(sharedHeaderRefs.avatar, sharedHeaderRefs.label, settingsModalState.session);
    setSharedSettingsHint(getSharedFriendlyError(error));
  }
}

function getSharedFriendlyError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (msg.includes("already") && msg.includes("use")) return "This email is already in use.";
  if (msg.includes("invalid") || msg.includes("wrong")) return "That value is not valid.";
  if (msg.includes("too many") || msg.includes("rate")) return "Too many attempts. Try again in a few minutes.";
  if (msg.includes("confirm")) return "Check your email to confirm the change.";
  return "Could not complete that action. Try again.";
}

async function signOutSharedSession() {
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
  settingsModalState.session = null;
  renderSharedAccount(sharedHeaderRefs.avatar, sharedHeaderRefs.label, null);
  closeSharedSettingsModal();
  window.dispatchEvent(new CustomEvent("cinerune:session-updated", { detail: null }));
  if (shouldRedirectAfterSignOut()) {
    window.location.href = "./index.html";
  }
}

function shouldRedirectAfterSignOut() {
  const path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
  return path.endsWith("/lists")
    || path.endsWith("/lists.html")
    || path.endsWith("/inbox")
    || path.endsWith("/inbox.html");
}

function setSharedSettingsHint(message) {
  if (settingsModalState.hint) settingsModalState.hint.textContent = message;
  animateSharedHint(settingsModalState.hint, message);
  const tone = sharedHintTone(message);
  if (tone) showToast(message, tone);
}

function sharedHintTone(message) {
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
    || lowered.includes("incorrect");
  if (isError) return "error";
  const isSuccess = lowered.includes("signed in")
    || lowered.includes("signed out")
    || lowered.includes("saved")
    || lowered.includes("updated")
    || lowered.includes("sent")
    || lowered.includes("created")
    || lowered.includes("check your email");
  return isSuccess ? "success" : "";
}

function animateSharedHint(node, message) {
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
  const className = isError ? "shared-hint-error" : (isSuccess ? "shared-hint-success" : "shared-hint-flash");
  node.classList.remove("shared-hint-flash", "shared-hint-success", "shared-hint-error");
  void node.offsetWidth;
  node.classList.add(className);
  window.clearTimeout(animateSharedHint.timer);
  animateSharedHint.timer = window.setTimeout(() => {
    node.classList.remove("shared-hint-flash", "shared-hint-success", "shared-hint-error");
  }, 760);
}

async function saveSharedUsername() {
  const session = await ensureSession();
  if (!session?.user) {
    setSharedSettingsHint("Sign in first.");
    return;
  }
  const username = normalizeUsername(settingsModalState.username?.value);
  const usernameConfirm = normalizeUsername(settingsModalState.usernameConfirm?.value);
  if (!username) {
    setSharedSettingsHint("Provide a username with 3-24 letters, numbers, dots, underscores, or dashes.");
    return;
  }
  if (username !== usernameConfirm) {
    setSharedSettingsHint("Usernames do not match.");
    return;
  }
  try {
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: { username }
    });
    applySharedSessionUpdate(session, updated?.user || updated, { username });
    if (settingsModalState.currentUsernameDisplay) settingsModalState.currentUsernameDisplay.value = username;
    if (settingsModalState.username) settingsModalState.username.value = "";
    if (settingsModalState.usernameConfirm) settingsModalState.usernameConfirm.value = "";
    setSharedSettingsHint("Username updated.");
  } catch (error) {
    setSharedSettingsHint(getSharedFriendlyError(error));
  }
}

async function saveSharedEmail() {
  const session = await ensureSession();
  if (!session?.user) {
    setSharedSettingsHint("Sign in first.");
    return;
  }
  const email = normalizeEmail(settingsModalState.email?.value || "", true);
  const emailConfirm = normalizeEmail(settingsModalState.emailConfirm?.value || "", true);
  if (!email) {
    setSharedSettingsHint("Enter a valid email address.");
    return;
  }
  if (email !== emailConfirm) {
    setSharedSettingsHint("Emails do not match.");
    return;
  }
  try {
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: { email }
    });
    applySharedSessionUpdate(session, updated?.user || updated, { email });
    if (settingsModalState.email) settingsModalState.email.value = "";
    if (settingsModalState.emailConfirm) settingsModalState.emailConfirm.value = "";
    if (!updated?.pendingEmailConfirmation && settingsModalState.currentEmailDisplay) {
      settingsModalState.currentEmailDisplay.value = email;
    }
    setSharedSettingsHint(updated?.pendingEmailConfirmation
      ? "Check your email to confirm the new address."
      : "Email saved.");
    await refreshSharedCurrentUser();
  } catch (error) {
    setSharedSettingsHint(getSharedFriendlyError(error));
  }
}

async function refreshSharedCurrentUser() {
  const session = await ensureSession();
  if (!session?.access_token) return;
  const currentUser = await apiRequest("/auth/me", {
    method: "GET",
    headers: authHeaders(session)
  });
  if (!currentUser?.user && !currentUser?.id) return;
  applySharedSessionUpdate(session, currentUser?.user || currentUser);
}

async function saveSharedPassword() {
  const session = await ensureSession();
  if (!session?.user) {
    setSharedSettingsHint("Sign in first.");
    return;
  }
  const currentPassword = String(settingsModalState.currentPassword?.value || "");
  const password = String(settingsModalState.password?.value || "");
  const confirm = String(settingsModalState.confirm?.value || "");
  if (!isValidPassword(currentPassword)) {
    setSharedSettingsHint("Enter your old password first.");
    return;
  }
  if (!isValidPassword(password)) {
    setSharedSettingsHint("Provide a password with 6-128 characters.");
    return;
  }
  if (password !== confirm) {
    setSharedSettingsHint("Passwords do not match.");
    return;
  }
  try {
    const updated = await apiRequest("/auth/update", {
      method: "POST",
      headers: authHeaders(session),
      body: { currentPassword, password }
    });
    applySharedSessionUpdate(session, updated?.user || updated);
    if (settingsModalState.currentPassword) settingsModalState.currentPassword.value = "";
    if (settingsModalState.password) settingsModalState.password.value = "";
    if (settingsModalState.confirm) settingsModalState.confirm.value = "";
    setSharedSettingsHint("Password updated.");
  } catch (error) {
    setSharedSettingsHint(getSharedFriendlyError(error));
  }
}

async function deleteSharedAccount() {
  const session = await ensureSession();
  if (!session?.user) {
    setSharedSettingsHint("Sign in first.");
    return;
  }
  if (String(settingsModalState.deleteConfirm?.value || "").trim() !== "DELETE") {
    setSharedSettingsHint("Type DELETE to confirm account deletion.");
    return;
  }
  try {
    await apiRequest("/auth/delete", {
      method: "POST",
      headers: authHeaders(session)
    });
    clearUserLocalData(session);
    clearStoredSession();
    settingsModalState.session = null;
    renderSharedAccount(sharedHeaderRefs.avatar, sharedHeaderRefs.label, null);
    closeSharedSettingsModal();
    window.location.href = "./index.html";
  } catch (error) {
    setSharedSettingsHint(getSharedFriendlyError(error));
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

function applySharedSessionUpdate(session, user, metadataPatch = {}) {
  const nextUser = user?.id
    ? user
    : {
        ...session.user,
        user_metadata: {
          ...(session.user.user_metadata || {}),
          ...metadataPatch
        }
      };
  const nextSession = {
    ...session,
    user: {
      ...session.user,
      ...nextUser,
      user_metadata: {
        ...(session.user.user_metadata || {}),
        ...(nextUser.user_metadata || {}),
        ...metadataPatch
      }
    }
  };
  settingsModalState.session = nextSession;
  setStoredSession(nextSession);
  renderSharedAccount(sharedHeaderRefs.avatar, sharedHeaderRefs.label, nextSession);
}

function normalizeUsername(value) {
  const trimmed = sanitizeText(value, 24).toLowerCase();
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function normalizeIdentifier(value) {
  const trimmed = sanitizeText(value, 80).toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) {
    return /.+@.+\..+/.test(trimmed) ? trimmed : "";
  }
  return /^[a-z0-9._-]{3,24}$/.test(trimmed) ? trimmed : "";
}

function normalizeEmail(value, allowBlank = false) {
  const trimmed = sanitizeText(value, 80).toLowerCase();
  if (!trimmed) return allowBlank ? "" : null;
  return /.+@.+\..+/.test(trimmed) ? trimmed : null;
}

function displayEmail(value) {
  const email = normalizeEmail(value || "", true);
  if (!email || email.endsWith("@cinerune.user") || email.endsWith("@users.cinerune.app")) return "";
  return email;
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 128;
}

function cssEscape(value) {
  return String(value || "").replaceAll('"', "\\\"");
}

function ensureAccountMenuIcons(menu) {
  if (!menu) return;
  const iconMap = {
    settings: "<svg viewBox=\"0 0 24 24\"><path d=\"M4 6h16\"/><circle cx=\"9\" cy=\"6\" r=\"2\"/><path d=\"M4 12h16\"/><circle cx=\"15\" cy=\"12\" r=\"2\"/><path d=\"M4 18h16\"/><circle cx=\"8\" cy=\"18\" r=\"2\"/></svg>",
    inbox: "<svg viewBox=\"0 0 24 24\"><path d=\"M4 6h16v12H4z\"/><path d=\"M4 7l8 6 8-6\"/></svg>",
    bookmarks: "<svg viewBox=\"0 0 24 24\"><path d=\"M6 4h12v16l-6-4-6 4z\"/></svg>",
    "continue watching": "<svg viewBox=\"0 0 24 24\"><path d=\"M8 5l11 7-11 7z\"/></svg>",
    report: "<svg viewBox=\"0 0 24 24\"><path d=\"M8 6l-2-2\"/><path d=\"M16 6l2-2\"/><path d=\"M9 9h6\"/><path d=\"M8 13h8\"/><path d=\"M9 17h6\"/><rect x=\"7\" y=\"6\" width=\"10\" height=\"14\" rx=\"5\"/><path d=\"M3 13h4\"/><path d=\"M17 13h4\"/></svg>",
    "sign out": "<svg viewBox=\"0 0 24 24\"><path d=\"M10 5v14\"/><path d=\"M16 12H4\"/><path d=\"M16 12l-4-4\"/><path d=\"M16 12l-4 4\"/></svg>"
  };

  [...menu.querySelectorAll(".account-menu-item")].forEach((item) => {
    if (item.querySelector(".menu-icon")) return;
    const label = String(item.textContent || "").trim().toLowerCase();
    const icon = iconMap[label] || null;
    if (!icon) return;
    const span = document.createElement("span");
    span.className = "menu-icon";
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = icon;
    item.insertBefore(span, item.firstChild);
  });
}

export function ensureSharedReportMenuItem(menu, getSession) {
  if (!menu || menu.querySelector("[data-open-report]")) return;
  const button = document.createElement("button");
  button.className = "account-menu-item";
  button.type = "button";
  button.dataset.openReport = "true";
  button.innerHTML = `
    <span class="menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M8 6l-2-2"/><path d="M16 6l2-2"/><path d="M9 9h6"/><path d="M8 13h8"/><path d="M9 17h6"/><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M3 13h4"/><path d="M17 13h4"/></svg>
    </span>
    <span>Report</span>
  `;
  const signOut = menu.querySelector(".destructive, #signOutMenuBtn");
  menu.insertBefore(button, signOut || null);
  button.addEventListener("click", () => {
    menu.setAttribute("hidden", "");
    const accountButton = menu.closest(".account-menu-wrap")?.querySelector("button");
    accountButton?.classList.remove("active");
    accountButton?.setAttribute("aria-expanded", "false");
    openSharedReportDialog(getSession?.() || null);
  });
}

const sharedReportState = {
  session: null
};

export function initSharedFooterReport(getSession) {
  const notice = document.querySelector(".site-notice");
  if (!notice || notice.querySelector("[data-footer-report]")) return;
  const button = document.createElement("button");
  button.className = "notice-report-btn";
  button.type = "button";
  button.dataset.footerReport = "true";
  button.innerHTML = `
    <span class="control-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M8 6l-2-2"/><path d="M16 6l2-2"/><path d="M9 9h6"/><path d="M8 13h8"/><path d="M9 17h6"/><rect x="7" y="6" width="10" height="14" rx="5"/><path d="M3 13h4"/><path d="M17 13h4"/></svg>
    </span>
    <span>Report</span>
  `;
  notice.appendChild(button);
  button.addEventListener("click", () => openSharedReportDialog(getSession?.() || null));
}

export function openSharedReportDialog(session) {
  sharedReportState.session = session || null;
  let dialog = document.getElementById("sharedReportDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "sharedReportDialog";
    dialog.className = "report-dialog";
    dialog.innerHTML = `
      <form id="sharedReportForm" method="dialog">
        <h3>Send Report</h3>
        <p class="tiny muted">Report a bug, request a movie, or request a show.</p>
        <textarea id="sharedReportMessage" rows="4" placeholder="Write your report or request"></textarea>
        <div class="account-actions">
          <button id="sharedReportCancel" class="pill-btn ghost" value="cancel" type="button">Cancel</button>
          <button class="pill-btn" value="submit" type="submit">Send Report</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector("#sharedReportCancel")?.addEventListener("click", () => dialog.close("cancel"));
    dialog.querySelector("#sharedReportForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = dialog.querySelector("#sharedReportMessage");
      const message = sanitizeText(input?.value || "", 500);
      if (input && input.value !== message) input.value = message;
      if (!message) {
        animateFieldValidation(input);
        setSharedSettingsHint("Write a report message first.");
        return;
      }
      const report = {
        page: window.location.pathname,
        message,
        createdAt: Date.now(),
        userId: sharedReportState.session?.user?.id || ""
      };
      saveSharedLocalReport(report);
      void submitSharedReportToServer(report);
      dialog.close("submit");
      showToast("Report saved.", "success");
    });
  }
  const textarea = dialog.querySelector("#sharedReportMessage");
  if (textarea) textarea.value = "";
  dialog.showModal();
}

function animateFieldValidation(input) {
  if (!input) return;
  input.classList.remove("field-shake");
  void input.offsetWidth;
  input.classList.add("field-shake");
  input.focus();
}

function saveSharedLocalReport(report) {
  const reports = readJson("cinerune:reports", []);
  reports.unshift(report);
  localStorage.setItem("cinerune:reports", JSON.stringify(reports.slice(0, 200)));
}

async function submitSharedReportToServer(report) {
  try {
    const session = await ensureSession();
    await apiRequest("/report", {
      method: "POST",
      headers: authHeaders(session),
      body: report
    });
  } catch {
    // Keep the local fallback if no reports table exists yet.
  }
}

function ensureHeaderActionsGroup() {
  const header = document.querySelector(".home-topbar, .watch-topbar");
  if (!header) return null;
  const existing = header.querySelector(".header-actions");
  if (existing) return existing;
  const wrap = document.createElement("div");
  wrap.className = "header-actions";
  const notificationsWrap = document.getElementById("notificationsWrap");
  const accountWrap = document.getElementById("accountMenuWrap");
  header.appendChild(wrap);
  if (notificationsWrap) wrap.appendChild(notificationsWrap);
  if (accountWrap) wrap.appendChild(accountWrap);
  return wrap;
}

function ensureBookmarksLink(anchor) {
  if (!anchor || anchor.querySelector(".bookmark-pill")) return anchor?.querySelector(".bookmark-pill") || null;
  const link = document.createElement("a");
  link.className = "icon-pill bookmark-pill";
  link.href = "./lists.html";
  link.setAttribute("aria-label", "Bookmarks");
  link.setAttribute("hidden", "");
  link.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 4h12v16l-6-4-6 4z\"/></svg>";
  if (anchor.classList.contains("header-actions")) {
    anchor.insertBefore(link, anchor.firstChild);
  } else {
    anchor.parentElement?.insertBefore(link, anchor);
  }
  return link;
}

function updateBookmarksLink(link, session) {
  if (!link) return;
  if (session?.user) {
    link.removeAttribute("hidden");
  } else {
    link.setAttribute("hidden", "");
  }
}

export function renderSharedAccount(avatarEl, labelEl, session) {
  const signedIn = Boolean(session?.user);
  const avatarId = normalizeAvatarId(session?.user?.user_metadata?.avatarId || readJson("cinerune:avatar-choice", "none"));
  if (avatarEl) {
    avatarEl.toggleAttribute("hidden", !signedIn);
    if (signedIn) {
      const avatar = avatarOptions.find((option) => option.id === avatarId) || avatarOptions[0];
      avatarEl.referrerPolicy = "no-referrer";
      avatarEl.onerror = () => {
        avatarEl.onerror = null;
        avatarEl.src = avatarDataUri(avatar);
      };
      avatarEl.src = avatarSrcById(avatar.id);
      avatarEl.alt = `${avatar.label} avatar`;
    } else {
      avatarEl.removeAttribute("src");
      avatarEl.alt = "";
    }
  }
  if (labelEl) {
    labelEl.textContent = signedIn
      ? (session.user.user_metadata?.username || "Account")
      : "Login";
  }
}

export function initSharedNavSearch(options = {}) {
  const form = document.querySelector(".nav-search");
  const input = form?.querySelector(".nav-search-input");
  if (!form || !input || form.dataset.sharedSearchReady === "1") return;
  form.dataset.sharedSearchReady = "1";
  initConfiguredTmdb();

  let suggestions = form.querySelector(".search-suggestions");
  if (!suggestions) {
    suggestions = document.createElement("div");
    suggestions.className = "search-suggestions nav-search-suggestions";
    suggestions.setAttribute("hidden", "");
    form.appendChild(suggestions);
  }

  input.addEventListener("focus", () => {
    if (String(input.value || "").trim()) return;
    renderSharedRecentSearches(suggestions);
  });

  input.addEventListener("input", () => {
    const term = String(input.value || "");
    if (term.trim()) hideSharedSearchSuggestions(suggestions);
  });

  input.addEventListener("input", debounce(async () => {
    const term = String(input.value || "").slice(0, 80);
    const query = term.trim();
    if (!query) {
      renderSharedRecentSearches(suggestions);
      options.onClear?.();
      return;
    }
    if (query.length < 2) {
      hideSharedSearchSuggestions(suggestions);
      return;
    }
    try {
      const result = await searchCatalog(query, { page: 1 });
      const items = result.all || [...(result.movies || []), ...(result.tv || [])];
      const ranked = rankFuzzyResults(result.correctedQuery || query, items);
      renderSharedSearchSuggestions(suggestions, ranked, query, options.getProgress?.() || {});
      options.onResults?.(result, query);
    } catch {
      hideSharedSearchSuggestions(suggestions);
      options.onError?.();
    }
  }, 280));

  form.addEventListener("submit", () => {
    const term = sanitizeText(input.value, 80);
    if (term) saveSharedRecentSearch(term);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const term = sanitizeText(input.value, 80);
    if (!term) {
      event.preventDefault();
      hideSharedSearchSuggestions(suggestions);
    }
  });

  suggestions.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-recent-search]");
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      removeSharedRecentSearch(remove.dataset.removeRecentSearch);
      renderSharedRecentSearches(suggestions);
      input.focus();
      return;
    }

    const recent = event.target.closest("[data-recent-search]");
    if (recent) {
      saveSharedRecentSearch(recent.dataset.recentSearch);
      return;
    }

    const viewAll = event.target.closest("[data-view-all-results]");
    if (viewAll) {
      saveSharedRecentSearch(viewAll.dataset.viewAllResults);
    }
  });

  document.addEventListener("click", (event) => {
    if (form.contains(event.target)) return;
    hideSharedSearchSuggestions(suggestions);
  });
}

export function saveSharedRecentSearch(value) {
  const term = sanitizeText(value, 80);
  if (!term) return;
  const normalized = normalizeSearchQuery(term);
  const entries = getSharedRecentSearches()
    .filter((entry) => normalizeSearchQuery(entry) !== normalized);
  entries.unshift(term);
  localStorage.setItem(recentSearchesKey, JSON.stringify(entries.slice(0, RECENT_SEARCH_LIMIT)));
}

function removeSharedRecentSearch(value) {
  const normalized = normalizeSearchQuery(value);
  const entries = getSharedRecentSearches()
    .filter((entry) => normalizeSearchQuery(entry) !== normalized);
  localStorage.setItem(recentSearchesKey, JSON.stringify(entries));
}

function renderSharedRecentSearches(container) {
  const entries = getSharedRecentSearches();
  if (!entries.length) {
    hideSharedSearchSuggestions(container);
    return;
  }

  container.innerHTML = entries.map((entry, index) => `
    <div class="search-recent-row" style="animation-delay:${index * 25}ms">
      <a class="search-recent-link" href="${escapeHtml(buildSearchHref(entry))}" data-recent-search="${escapeHtml(entry)}">
        <span>${escapeHtml(entry)}</span>
      </a>
      <button class="search-recent-remove" type="button" data-remove-recent-search="${escapeHtml(entry)}" aria-label="Remove ${escapeHtml(entry)} from recent searches">x</button>
    </div>
  `).join("");
  container.removeAttribute("hidden");
}

function renderSharedSearchSuggestions(container, items, term, progress = {}) {
  const top = (items || []).slice(0, 8);
  const cleanTerm = sanitizeText(term, 80);
  if (!top.length && !cleanTerm) {
    hideSharedSearchSuggestions(container);
    return;
  }

  const rows = top.map((item, index) => {
    const type = item.mediaType === "movie" ? "Movie" : "TV";
    const subtitle = [type, item.year].filter(Boolean).join(" | ");
    return `
      <a class="search-suggestion" href="${escapeHtml(buildResumableWatchHref(item, progress))}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.mediaType)}" style="animation-delay:${index * 35}ms">
        <img class="search-suggestion-poster" src="${escapeHtml(item.poster || "")}" alt="${escapeHtml(item.title)} poster" loading="lazy" decoding="async" />
        <span>
          <span class="search-suggestion-title">${escapeHtml(item.title)}</span>
          <span class="search-suggestion-sub">${escapeHtml(subtitle)}</span>
        </span>
      </a>
    `;
  });
  if (cleanTerm) {
    rows.push(`
      <a class="search-view-all" href="${escapeHtml(buildSearchHref(cleanTerm))}" data-view-all-results="${escapeHtml(cleanTerm)}">
        <span>View all results</span>
        <span aria-hidden="true">&gt;</span>
      </a>
    `);
  }
  container.innerHTML = rows.join("");
  container.removeAttribute("hidden");
}

function buildSearchHref(term) {
  const url = new URL("./search.html", window.location.href);
  url.searchParams.set("q", sanitizeText(term, 80));
  url.searchParams.delete("page");
  return url.toString();
}

function rankFuzzyResults(query, items) {
  const FuseCtor = window.Fuse;
  if (!FuseCtor || !String(query || "").trim() || !Array.isArray(items) || items.length < 2) return items || [];
  const fuse = new FuseCtor(items, {
    keys: ["title", "name"],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2
  });
  const ranked = fuse.search(query).map((entry) => entry.item);
  if (!ranked.length) return items || [];
  const rankedKeys = new Set(ranked.map((item) => `${item.mediaType}:${item.id}`));
  return [...ranked, ...items.filter((item) => !rankedKeys.has(`${item.mediaType}:${item.id}`))];
}

function normalizeSearchQuery(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hideSharedSearchSuggestions(container) {
  if (!container) return;
  container.setAttribute("hidden", "");
  container.innerHTML = "";
}

export function normalizeAvatarId(value) {
  const legacyMap = {
    naruto: "ironman",
    spider: "darthvader",
    eren: "tonysoprano"
  };
  const mapped = legacyMap[value] || value;
  const fallback = avatarOptions[0]?.id || "none";
  return avatarOptions.some((option) => option.id === mapped) ? mapped : fallback;
}

export function avatarSrcById(value) {
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(value)) || avatarOptions[0];
  return avatar?.src || avatarDataUri(avatar);
}

export function avatarDataUri(avatar) {
  if (avatar?.id === "none") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Default profile"><rect width="128" height="128" rx="32" fill="#102035"/><circle cx="64" cy="48" r="23" fill="#6f8aa5"/><path d="M24 112c5-25 21-39 40-39s35 14 40 39" fill="#6f8aa5"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  const safeLabel = escapeHtml(avatar?.label || "Avatar");
  const initials = escapeHtml(String(avatar?.label || "AV").split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "AV");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeLabel}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#179de5"/><stop offset="100%" stop-color="#071528"/></linearGradient></defs><rect width="128" height="128" rx="32" fill="url(#g)"/><text x="64" y="73" fill="#e8f1fb" font-family="Arial, sans-serif" font-size="34" font-weight="800" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

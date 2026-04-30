import { clearStoredSession, ensureSession } from "./auth-client.js";

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

export function initSharedHeader() {
  const accountWrap = document.getElementById("accountMenuWrap");
  const accountBtn = document.getElementById("toggleAuth");
  const accountMenu = document.getElementById("accountMenu");
  const avatar = document.getElementById("authAvatarThumb");
  const label = document.getElementById("authButtonLabel");
  const signOut = document.getElementById("signOutMenuBtn");
  let currentSession = null;

  renderSharedAccount(avatar, label, null);

  ensureSession().then((session) => {
    currentSession = session;
    renderSharedAccount(avatar, label, session);
  }).catch(() => {
    currentSession = null;
    renderSharedAccount(avatar, label, null);
  });

  accountBtn?.addEventListener("click", async () => {
    if (!currentSession) {
      try {
        currentSession = await ensureSession();
        renderSharedAccount(avatar, label, currentSession);
      } catch {
        currentSession = null;
      }
    }
    if (!currentSession?.user) {
      window.location.href = "./index.html?auth=login";
      return;
    }
    if (!accountMenu) {
      window.location.href = "./index.html?auth=login";
      return;
    }
    const hidden = accountMenu.hasAttribute("hidden");
    if (hidden) {
      accountMenu.removeAttribute("hidden");
      accountBtn.classList.add("active");
    } else {
      accountMenu.setAttribute("hidden", "");
      accountBtn.classList.remove("active");
    }
  });

  signOut?.addEventListener("click", () => {
    clearStoredSession();
    currentSession = null;
    renderSharedAccount(avatar, label, null);
    accountMenu?.setAttribute("hidden", "");
  });

  document.addEventListener("click", (event) => {
    if (accountWrap && !accountWrap.contains(event.target)) {
      accountMenu?.setAttribute("hidden", "");
      accountBtn?.classList.remove("active");
    }
  });
}

function renderSharedAccount(avatarEl, labelEl, session) {
  const avatarId = normalizeAvatarId(session?.user?.user_metadata?.avatarId || readJson("cinerune:avatar-choice", "ninja"));
  if (avatarEl) {
    const avatar = avatarOptions.find((option) => option.id === avatarId) || avatarOptions[0];
    avatarEl.src = avatarDataUri(avatar);
    avatarEl.alt = `${avatar.label} avatar`;
  }
  if (labelEl) {
    labelEl.textContent = session?.user ? "Account" : "Login";
  }
}

export function normalizeAvatarId(value) {
  const fallback = avatarOptions[0]?.id || "ninja";
  return avatarOptions.some((option) => option.id === value) ? value : fallback;
}

export function avatarSrcById(value) {
  const avatar = avatarOptions.find((option) => option.id === normalizeAvatarId(value)) || avatarOptions[0];
  return avatarDataUri(avatar);
}

export function avatarDataUri(avatar) {
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
      <defs><linearGradient id="bg-${avatar.id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${safeBg1}" /><stop offset="100%" stop-color="${safeBg2}" /></linearGradient></defs>
      <rect width="128" height="128" rx="32" fill="url(#bg-${avatar.id})" />
      ${backHair}
      <path d="M 24 128 C 24 96 104 96 104 128" fill="${safeShirt}" />
      <path d="M 44 128 C 44 104 84 104 84 128" fill="rgba(255,255,255,0.15)" />
      <rect x="54" y="70" width="20" height="24" rx="8" fill="${safeSkin}" />
      <rect x="54" y="78" width="20" height="12" fill="rgba(0,0,0,0.1)" />
      <rect x="36" y="28" width="56" height="60" rx="26" fill="${safeSkin}" />
      ${frontHair}
      <circle cx="50" cy="58" r="4" fill="${safeEyes}" />
      <circle cx="78" cy="58" r="4" fill="${safeEyes}" />
      <circle cx="42" cy="66" r="5" fill="#ff0000" opacity="0.12" />
      <circle cx="86" cy="66" r="5" fill="#ff0000" opacity="0.12" />
      <path d="M 58 68 Q 64 74 70 68" stroke="${safeEyes}" stroke-width="3" stroke-linecap="round" fill="none" />
      ${accessory}
    </svg>`.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarBackHairSvg(style, color) {
  if (style === "bald") return "";
  if (style === "spiky") return `<path d="M 24 60 L 16 40 L 32 32 L 40 12 L 64 6 L 88 12 L 96 32 L 112 40 L 104 60 Z" fill="${color}" />`;
  if (style === "long") return `<rect x="32" y="40" width="64" height="60" rx="16" fill="${color}" /><path d="M 32 80 L 32 110 C 32 120 44 120 44 110 L 44 80 Z" fill="${color}" /><path d="M 96 80 L 96 110 C 96 120 84 120 84 110 L 84 80 Z" fill="${color}" />`;
  if (style === "bun") return `<circle cx="64" cy="18" r="14" fill="${color}" />`;
  if (style === "bob") return `<rect x="30" y="36" width="68" height="48" rx="20" fill="${color}" />`;
  return "";
}

function avatarFrontHairSvg(style, color) {
  if (style === "bald") return "";
  if (style === "spiky") return `<path d="M 32 52 L 36 26 L 48 38 L 54 18 L 64 36 L 74 18 L 80 38 L 92 26 L 96 52 Z" fill="${color}" />`;
  if (style === "short") return `<path d="M 32 52 C 32 16 96 16 96 52 C 96 58 84 46 64 42 C 44 38 32 58 32 52 Z" fill="${color}" />`;
  if (style === "long" || style === "bun") return `<path d="M 36 46 C 36 20 92 20 92 46 Q 78 34 64 34 Q 50 34 36 46 Z" fill="${color}" />`;
  if (style === "bob") return `<path d="M 36 48 C 36 20 92 20 92 48 Q 78 34 64 34 Q 50 34 36 48 Z" fill="${color}" />`;
  return "";
}

function avatarAccessorySvg(accessory, accent, eyes) {
  if (accessory === "headband") return `<rect x="36" y="36" width="56" height="12" fill="${accent}" /><rect x="52" y="38" width="24" height="8" rx="2" fill="#ddd" />`;
  if (accessory === "strawhat") return `<ellipse cx="64" cy="32" rx="46" ry="12" fill="${accent}" /><path d="M 42 30 C 42 8 86 8 86 30 Z" fill="${accent}" /><path d="M 43 26 C 43 28 85 28 85 26 Z" fill="#e03131" stroke="#e03131" stroke-width="3" />`;
  if (accessory === "glasses_scar" || accessory === "glasses_goatee") return `<rect x="36" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" /><rect x="68" y="48" width="24" height="18" rx="6" stroke="${eyes}" stroke-width="3" fill="none" /><line x1="60" y1="57" x2="68" y2="57" stroke="${eyes}" stroke-width="3" />`;
  if (accessory === "blindfold") return `<rect x="36" y="48" width="56" height="18" fill="${accent}" />`;
  if (accessory === "earring") return `<circle cx="34" cy="64" r="4" fill="${accent}" /><circle cx="94" cy="64" r="4" fill="${accent}" />`;
  if (accessory === "star") return `<path d="M 82 32 L 84 38 L 90 38 L 85 42 L 87 48 L 82 44 L 77 48 L 79 42 L 74 38 L 80 38 Z" fill="${accent}" />`;
  return "";
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

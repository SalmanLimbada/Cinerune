const TOAST_TIMEOUT_MS = 1800;

let toastWrap = null;
let toastTimer = 0;

export function showToast(message, tone = "success") {
  const text = String(message || "").trim();
  if (!text) return;

  if (!toastWrap) {
    toastWrap = document.createElement("div");
    toastWrap.className = "site-toast-wrap";
    toastWrap.setAttribute("aria-live", "polite");
    toastWrap.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastWrap);
  }

  toastWrap.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = `site-toast ${tone === "error" ? "error" : "success"}`;
  toast.textContent = text;
  toastWrap.appendChild(toast);

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => {
      if (toast.parentNode === toastWrap) toast.remove();
    }, 220);
  }, TOAST_TIMEOUT_MS);
}

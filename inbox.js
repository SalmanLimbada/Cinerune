import { initSharedHeader } from "./shared-ui.js?v=20260513-fixes1";
import { ensureSession } from "./auth-client.js";
import { initInboxPage } from "./notifications.js?v=20260513-fixes1";
import { initDragScroll } from "./drag-scroll.js?v=20260513-fixes1";

boot();

async function boot() {
  initSharedHeader();
  let session = null;
  try {
    session = await ensureSession();
  } catch {
    session = null;
  }
  if (!session?.user) {
    window.location.replace("./index.html");
    return;
  }
  initInboxPage();
  initDragScroll();
}

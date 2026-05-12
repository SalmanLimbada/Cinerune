export function initDragScroll(selector = ".poster-row, .explorer-rail") {
  if (window.matchMedia?.("(pointer: coarse)").matches) return;
  document.querySelectorAll(selector).forEach((rail) => {
    if (rail.dataset.dragScrollReady === "1") return;
    rail.dataset.dragScrollReady = "1";

    let dragging = false;
    let armed = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let moved = false;
    let targetScrollLeft = 0;
    let currentScrollLeft = 0;
    let rafId = 0;

    const animate = () => {
      const diff = targetScrollLeft - currentScrollLeft;
      if (Math.abs(diff) < 0.5) {
        rail.scrollLeft = targetScrollLeft;
        currentScrollLeft = targetScrollLeft;
        rafId = 0;
        return;
      }
      currentScrollLeft += diff * 0.35;
      rail.scrollLeft = currentScrollLeft;
      rafId = window.requestAnimationFrame(animate);
    };

    rail.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("input, select, textarea, .continue-remove-btn")) return;
      armed = true;
      dragging = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = rail.scrollLeft;
      targetScrollLeft = startScrollLeft;
      currentScrollLeft = startScrollLeft;
      moved = false;
    });

    rail.addEventListener("dragstart", (event) => {
      if (event.target.closest("img, .poster-img, .poster-btn")) {
        event.preventDefault();
      }
    });

    rail.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const delta = event.clientX - startX;
      const verticalDelta = event.clientY - startY;
      if (!dragging) {
        if (Math.abs(verticalDelta) > Math.abs(delta) + 4) {
          pointerId = null;
          armed = false;
          return;
        }
        if (Math.abs(delta) < 7) return;
        dragging = true;
        rail.classList.add("dragging");
        rail.setPointerCapture?.(pointerId);
      }
      event.preventDefault();
      if (Math.abs(delta) > 4) moved = true;
      targetScrollLeft = startScrollLeft - delta;
      if (!rafId) {
        rafId = window.requestAnimationFrame(animate);
      }
    });

    const endDrag = (event) => {
      if (event.pointerId !== pointerId) return;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      dragging = false;
      armed = false;
      pointerId = null;
      rail.classList.remove("dragging");
      window.setTimeout(() => {
        moved = false;
      }, 0);
    };

    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("click", (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  });
}

export function balancePosterGrid(container) {
  if (!container?.classList?.contains("poster-grid")) return;

  const apply = () => {
    const cards = [...container.querySelectorAll(":scope > .poster-card")];
    cards.forEach((card) => {
      card.hidden = false;
    });
    if (cards.length < 2) return;

    const columns = getGridColumnCount(container);
    if (columns < 2) return;

    if (cards.length < columns) return;

    const remainder = cards.length % columns;
    if (!remainder) return;

    cards.slice(cards.length - remainder).forEach((card) => {
      card.hidden = true;
    });
  };

  apply();
  window.requestAnimationFrame(apply);

  if (container.dataset.gridBalanceReady === "1") return;
  container.dataset.gridBalanceReady = "1";
  window.addEventListener("resize", debounce(apply, 120), { passive: true });
}

function getGridColumnCount(container) {
  const template = window.getComputedStyle(container).gridTemplateColumns || "";
  if (!template || template === "none") return 0;
  return template.split(" ").filter(Boolean).length;
}

function debounce(fn, delay) {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, delay);
  };
}

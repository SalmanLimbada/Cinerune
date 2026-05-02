export function initDragScroll(selector = ".poster-row, .explorer-rail") {
  document.querySelectorAll(selector).forEach((rail) => {
    if (rail.dataset.dragScrollReady === "1") return;
    rail.dataset.dragScrollReady = "1";

    let dragging = false;
    let armed = false;
    let pointerId = null;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    rail.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("input, select, textarea, .continue-remove-btn")) return;
      armed = true;
      dragging = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = rail.scrollLeft;
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
      if (!dragging) {
        if (Math.abs(delta) < 7) return;
        dragging = true;
        rail.classList.add("dragging");
        rail.setPointerCapture?.(pointerId);
      }
      if (Math.abs(delta) > 4) moved = true;
      rail.scrollLeft = startScrollLeft - delta;
    });

    const endDrag = (event) => {
      if (event.pointerId !== pointerId) return;
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

function watchCards(change, elements) {
  let frame = null;
  let active = true;
  const schedule = () => {
    if (!active || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; change(); });
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  resize?.observe(document.body);
  for (const element of elements) resize?.observe(element);
  document.fonts.ready.then(schedule);
  return () => {
    active = false;
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    resize?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

export function createCardMotion(elements, {
  watch = typeof window === "undefined" || typeof DOMMatrixReadOnly === "undefined" ? null : watchCards,
  bounds = element => {
    const rect = element.getBoundingClientRect();
    // Remove our translation so animation cannot move its own scroll trigger.
    const y = new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
    return { top: rect.top - y, bottom: rect.bottom - y };
  },
  viewport = () => window.innerHeight,
  computed = element => getComputedStyle(element),
  activeElement = () => document.activeElement,
  narrow = () => window.innerWidth < 650,
} = {}) {
  const records = new Map(elements.map(element => [element, { animation: null }]));
  let stopWatching;
  let enabled = false;
  let generation = 0;

  function reveal(element) {
    const record = records.get(element);
    if (!record) return;
    record.animation?.cancel();
    record.animation = null;
    element.style.transform = "";
    element.style.opacity = "";
    element.dataset.motionState = "visible";
  }

  function transition(element, entering) {
    const record = records.get(element);
    if (!record) return;
    if (element.contains(activeElement())) { reveal(element); return; }
    const state = element.dataset.motionState;
    if ((entering && (state === "entering" || state === "visible")) ||
        (!entering && (state === "exiting" || state === "outside"))) return;
    if (typeof element.animate !== "function") { reveal(element); return; }
    const style = computed(element);
    const distance = narrow() ? 80 : 120;
    const initial = entering && (!state || state === "outside")
      ? { transform: `translateY(${distance}px)`, opacity: 0 }
      : { transform: style.transform, opacity: style.opacity };
    record.animation?.cancel();
    const final = entering
      ? { transform: "translateY(0px)", opacity: 1 }
      : { transform: `translateY(-${distance}px)`, opacity: 0 };
    element.style.transform = final.transform;
    element.style.opacity = String(final.opacity);
    element.dataset.motionState = entering ? "entering" : "exiting";
    const animation = element.animate([initial, final], {
      duration: entering ? 1000 : 750,
      easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
    });
    record.animation = animation;
    animation.onfinish = () => {
      if (record.animation !== animation) return;
      record.animation = null;
      element.dataset.motionState = entering ? "visible" : "outside";
      if (entering) { element.style.transform = ""; element.style.opacity = ""; }
    };
  }

  function setEnabled(value) {
    enabled = value && Boolean(watch);
    const current = ++generation;
    stopWatching?.();
    stopWatching = null;
    for (const element of records.keys()) {
      reveal(element);
      delete element.dataset.motionState;
    }
    if (!enabled) return;
    const update = () => {
      if (!enabled || current !== generation) return;
      const height = viewport();
      const positions = elements.map(element => ({ element, ...bounds(element) }));
      for (const { element, top, bottom } of positions) {
        if (element.contains(activeElement()) || typeof element.animate !== "function") {
          reveal(element);
          continue;
        }
        const state = element.dataset.motionState;
        const present = state === "visible" || state === "entering";
        // Separate entry/exit bands keep small edge movements from replaying cards.
        const inside = present
          ? bottom > height * 0.18 && top < height * 0.98
          : bottom > height * 0.28 && top < height * 0.82;
        if (!state && !inside) {
          element.style.transform = `translateY(${(top > 0 ? 1 : -1) * (narrow() ? 80 : 120)}px)`;
          element.style.opacity = "0";
          element.dataset.motionState = "outside";
        } else {
          transition(element, inside);
        }
      }
    };
    update();
    stopWatching = watch(update, elements);
  }
  return {
    setEnabled,
    reveal,
    destroy() { setEnabled(false); },
  };
}

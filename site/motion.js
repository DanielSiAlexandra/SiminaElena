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
  watch = typeof window === "undefined" ? null : watchCards,
  bounds = element => {
    // Offsets ignore transforms, so a turning page cannot move its own scroll trigger.
    let top = 0;
    for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
    top -= window.scrollY;
    return { top, bottom: top + element.offsetHeight };
  },
  viewport = () => window.innerHeight,
  activeElement = () => document.activeElement,
  random = Math.random,
  // Builds the page-turn engine for one note; see book-flip.js (BookBlock).
  flipper = null,
} = {}) {
  const pinTones = ["sage", "ochre", "clay"];
  const records = new Map(elements.map(element => {
    element.dataset.pinTone = pinTones[Math.floor(random() * pinTones.length)];
    return [element, { flip: null, token: 0 }];
  }));
  let stopWatching;
  let enabled = false;
  let generation = 0;

  function reveal(element) {
    const record = records.get(element);
    if (!record) return;
    record.token++;
    element.dataset.motionState = "visible";
    record.flip?.settle(true);
  }

  function transition(element, entering) {
    const record = records.get(element);
    if (!record) return;
    if (element.contains(activeElement())) { reveal(element); return; }
    const state = element.dataset.motionState;
    if ((entering && (state === "entering" || state === "visible")) ||
        (!entering && (state === "exiting" || state === "outside"))) return;
    const token = ++record.token;
    element.dataset.motionState = entering ? "entering" : "exiting";
    record.flip.turn(entering, () => {
      if (record.token !== token) return;
      element.dataset.motionState = entering ? "visible" : "outside";
    });
  }

  function setEnabled(value) {
    enabled = value && Boolean(watch) && Boolean(flipper);
    const current = ++generation;
    stopWatching?.();
    stopWatching = null;
    for (const element of records.keys()) {
      reveal(element);
      delete element.dataset.motionState;
    }
    if (!enabled) return;
    for (const [element, record] of records) record.flip ??= flipper(element);
    const update = () => {
      if (!enabled || current !== generation) return;
      const height = viewport();
      const positions = elements.map(element => ({ element, ...bounds(element) }));
      for (const { element, top, bottom } of positions) {
        if (element.contains(activeElement())) {
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
          element.dataset.motionState = "outside";
          records.get(element).flip.settle(false);
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

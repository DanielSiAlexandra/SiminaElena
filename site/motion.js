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

// Book-style turn around the left spiral; pages always travel right-to-left (negative rotateY).
// Depth scales with the note width so wide desktop notes don't balloon toward the viewer mid-turn.
const BOOK_EASING = "cubic-bezier(0.25, 1, 0.5, 1)";
function turnFrames(element) {
  const depth = Math.max(1200, Math.round((element.offsetWidth || 0) * 3));
  const at = angle => `perspective(${depth}px) rotateY(${angle}deg)`;
  return {
    turned: { transform: at(-180), opacity: 0 },
    flat: { transform: at(0), opacity: 1 },
    entry: [{ transform: at(0), opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: at(0), opacity: 1 }],
    // A blank cover page lies on the note and turns away over the spiral, revealing it.
    cover: [{ transform: at(0) }, { transform: at(-180) }],
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
  computed = element => getComputedStyle(element),
  activeElement = () => document.activeElement,
  random = Math.random,
} = {}) {
  const pinTones = ["sage", "ochre", "clay"];
  const records = new Map(elements.map(element => {
    element.dataset.pinTone = pinTones[Math.floor(random() * pinTones.length)];
    return [element, { animation: null, cover: null }];
  }));
  let stopWatching;
  let enabled = false;
  let generation = 0;

  function reveal(element) {
    const record = records.get(element);
    if (!record) return;
    record.animation?.cancel();
    record.animation = null;
    record.cover?.cancel();
    record.cover = null;
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
    const fresh = entering && (!state || state === "outside");
    const current = { transform: style.transform, opacity: style.opacity };
    record.animation?.cancel();
    const frames = turnFrames(element);
    const final = entering ? frames.flat : frames.turned;
    element.style.transform = final.transform;
    element.style.opacity = String(final.opacity);
    element.dataset.motionState = entering ? "entering" : "exiting";
    const animation = element.animate(fresh ? frames.entry : [current, final], {
      duration: entering ? 1200 : 900,
      easing: entering ? BOOK_EASING : "cubic-bezier(0.45, 0, 0.55, 1)",
    });
    if (fresh) {
      const cover = element.querySelector?.(":scope > .page-cover");
      record.cover?.cancel();
      record.cover = cover?.animate(frames.cover, { duration: 1200, easing: BOOK_EASING, fill: "forwards" }) ?? null;
    }
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
          element.style.transform = turnFrames(element).turned.transform;
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

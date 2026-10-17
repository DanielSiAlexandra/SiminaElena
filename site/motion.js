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

const FOLDED = { transform: "perspective(2000px) rotateX(-88deg)", opacity: 0 };
const FLAT = { transform: "perspective(2000px) rotateX(0deg)", opacity: 1 };
// Hinged at the adhesive top edge: the page swings down, slightly overshoots, then lies flat.
const FLIP_DOWN = [
  FOLDED,
  { transform: "perspective(2000px) rotateX(-55deg)", opacity: 1, offset: 0.3 },
  { transform: "perspective(2000px) rotateX(5deg)", offset: 0.72 },
  { transform: "perspective(2000px) rotateX(-1.5deg)", offset: 0.88 },
  FLAT,
];

export function createCardMotion(elements, {
  watch = typeof window === "undefined" ? null : watchCards,
  bounds = element => {
    // Offsets ignore transforms, so a flipping note cannot move its own scroll trigger.
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
  const pinTones = ["forest", "ochre", "red"];
  const records = new Map(elements.map(element => {
    element.dataset.pinTone = pinTones[Math.floor(random() * pinTones.length)];
    return [element, { animation: null }];
  }));
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
    const fresh = entering && (!state || state === "outside");
    const current = { transform: style.transform, opacity: style.opacity };
    record.animation?.cancel();
    const final = entering ? FLAT : FOLDED;
    element.style.transform = final.transform;
    element.style.opacity = String(final.opacity);
    element.dataset.motionState = entering ? "entering" : "exiting";
    const frames = fresh ? FLIP_DOWN : [current, final];
    const animation = element.animate(frames, {
      duration: entering ? 1000 : 750,
      easing: entering ? "cubic-bezier(0.3, 0.6, 0.35, 1)" : "cubic-bezier(0.55, 0, 0.8, 0.45)",
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
          element.style.transform = FOLDED.transform;
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

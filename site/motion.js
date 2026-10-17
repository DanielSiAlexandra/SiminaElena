export function createCardMotion(elements, {
  observe = typeof IntersectionObserver === "undefined" ? null : callback => new IntersectionObserver(callback, {
    rootMargin: "-5% 0px -5% 0px", threshold: 0,
  }),
  computed = element => getComputedStyle(element),
  activeElement = () => document.activeElement,
  narrow = () => window.innerWidth < 650,
} = {}) {
  const records = new Map(elements.map(element => [element, { animation: null }]));
  let observer;
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
    const distance = narrow() ? 24 : 48;
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
      duration: entering ? 560 : 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
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
    enabled = value && Boolean(observe);
    const current = ++generation;
    observer?.disconnect();
    for (const element of records.keys()) {
      reveal(element);
      delete element.dataset.motionState;
    }
    if (!enabled) return;
    observer = observe(entries => {
      if (!enabled || current !== generation) return;
      for (const entry of entries) transition(entry.target, entry.isIntersecting);
    });
    for (const element of records.keys()) observer.observe(element);
  }
  return {
    setEnabled,
    reveal,
    destroy() { setEnabled(false); },
  };
}

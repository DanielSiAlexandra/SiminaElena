(() => {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Set();
  preference.addEventListener("change", () => {
    if (preference.matches) {
      for (const animation of active) animation.cancel();
      active.clear();
    }
  });
  if (preference.matches || typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (preference.matches || typeof entry.target.animate !== "function") continue;
      const animation = entry.target.animate(
        [
          { transform: "translateY(16px)", opacity: 0.82 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      active.add(animation);
      animation.onfinish = () => active.delete(animation);
    }
  }, { threshold: 0.12 });

  for (const element of document.querySelectorAll("[data-enter]")) observer.observe(element);
})();

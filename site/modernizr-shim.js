// BookBlock reads a handful of Modernizr feature tests at load time; answer them natively.
const probe = document.createElement("div").style;
const supports = (property, value) => globalThis.CSS?.supports?.(property, value) ?? false;

window.Modernizr = {
  csstransitions: "transition" in probe,
  csstransforms3d: supports("transform", "rotateY(1deg)"),
  prefixed: property => property in probe ? property : false,
  testStyles(rule, callback) {
    const style = document.createElement("style");
    const element = document.createElement("div");
    style.textContent = rule;
    element.id = "modernizr";
    document.head.append(style);
    document.body.append(element);
    try { callback(element, rule); } finally { element.remove(); style.remove(); }
  },
  addTest(name, test) { this[name] = Boolean(test()); },
};

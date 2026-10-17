import { createCardMotion } from "./motion.js";
import { createPen, traceStrokes } from "./pen.js";
import handwriting from "./assets/handwriting.svg?raw";

const cards = [...document.querySelectorAll("[data-card]")];
const cardMotion = createCardMotion(cards);
const rail = document.querySelector(".pen-rail");
const penArt = document.querySelector(".floating-pen");
const ink = document.querySelector(".handwriting");
ink.innerHTML = handwriting;
const phrases = [...ink.querySelectorAll("path")].map(path => {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const strokes = path.getAttribute("d").match(/M[^M]+/g).map(data => {
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stroke.setAttribute("d", data);
    group.append(stroke);
    return stroke;
  });
  path.replaceWith(group);
  const lengths = strokes.map(stroke => stroke.getTotalLength());
  for (const [index, stroke] of strokes.entries()) stroke.style.strokeDasharray = `${lengths[index]} ${lengths[index]}`;
  return { group, strokes, lengths };
});
const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
let inkTop = 0;
let currentPath;

function placePen(x, y, tilt) {
  penArt.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
}

const pen = createPen({
  bounds: () => ({ min: 120, max: Math.max(120, window.innerHeight - 100) }),
  move: (y, tilt) => placePen(rail.clientWidth * 0.5, y, tilt - 20),
  clear: () => {
    ink.hidden = true;
    currentPath = null;
  },
  draw: (progress, phrase, startY) => {
    const scale = Math.min(1, rail.clientWidth / 56);
    const inscription = phrases[phrase];
    if (currentPath !== inscription) {
      currentPath = inscription;
      for (const candidate of phrases) candidate.group.style.display = candidate === inscription ? "" : "none";
      inkTop = Math.max(90, Math.min(window.innerHeight - 250 * scale - 24, startY));
      ink.style.top = `${inkTop}px`;
      ink.style.width = `${52 * scale}px`;
      ink.style.height = `${240 * scale}px`;
      ink.hidden = false;
    }
    const trace = traceStrokes(inscription.lengths, progress);
    inscription.strokes.forEach((stroke, index) => { stroke.style.strokeDashoffset = String(trace.offsets[index]); });
    const point = inscription.strokes[trace.index].getPointAtLength(trace.distance);
    const x = (rail.clientWidth - 52 * scale) / 2 + (48 - point.y) * scale;
    const y = inkTop + point.x * scale;
    placePen(x, y, -28 + Math.sin(progress * Math.PI * 8) * 5);
    return y;
  },
  change: state => { rail.dataset.state = state; },
});

let effectiveMotion = false;
pen.setVisible(!document.hidden);
function updateMotion() {
  effectiveMotion = !preference.matches;
  cardMotion.setEnabled(effectiveMotion && !document.hidden);
  pen.setEnabled(effectiveMotion);
}
updateMotion();
preference.addEventListener("change", updateMotion);

window.addEventListener("pointermove", event => {
  if (effectiveMotion && event.pointerType !== "touch") {
    pen.target(event.clientY, ((event.clientX / window.innerWidth) - 0.5) * 24);
  }
}, { passive: true });
let touchStart;
window.addEventListener("pointerdown", event => {
  if (event.pointerType === "touch") touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
}, { passive: true });
window.addEventListener("pointerup", event => {
  if (effectiveMotion && event.pointerType === "touch" && touchStart?.id === event.pointerId &&
      Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) < 12 &&
      !event.target.closest("button, a, summary")) pen.target(event.clientY);
  touchStart = null;
}, { passive: true });
window.addEventListener("pointercancel", () => { touchStart = null; }, { passive: true });
window.addEventListener("resize", () => pen.reposition(), { passive: true });
window.addEventListener("scroll", () => { if (effectiveMotion) pen.reposition(); }, { passive: true });
document.addEventListener("visibilitychange", () => {
  pen.setVisible(!document.hidden);
  cardMotion.setEnabled(effectiveMotion && !document.hidden);
});
document.addEventListener("focusin", event => cardMotion.reveal(event.target.closest("[data-card]")));
function revealAnchor() {
  const target = document.getElementById(location.hash.slice(1));
  if (!target) return;
  for (const card of cards) {
    if (card.contains(target) || target.contains(card)) cardMotion.reveal(card);
  }
}
window.addEventListener("hashchange", revealAnchor);
revealAnchor();
window.addEventListener("pagehide", () => {
  cardMotion.destroy();
  pen.setVisible(false);
});
window.addEventListener("pageshow", event => {
  if (event.persisted) {
    pen.setVisible(true);
    cardMotion.setEnabled(effectiveMotion);
  }
});

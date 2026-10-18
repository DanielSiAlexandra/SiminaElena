// Codrops BookBlock v2.0.1 (vanilla build, MIT), vendored unmodified from
// https://github.com/codrops/BookBlock at commit 3fcee0a705a1bd59c89ae4ff543cb2e4e7d24330.
import "./modernizr-shim.js";
import "./vendor/bookblock/bookblock.js";
import "./vendor/bookblock/bookblock.css";

const BookBlock = window.BookBlock;
const TURN_SPEED = 1600;
const phone = window.matchMedia("(max-width: 650px)");
// On phones the middle notes slide instead: in from below, out through the top.
const SLIDE_ENTRY = 1400;
const SLIDE_EXIT = 1100;
const SLIDE_TRAVEL = 80;
const SLIDE_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";

function slides(card) {
  return phone.matches && !card.closest(".hero") && card.id !== "contact";
}

// Hero notes and every note on phones fold their lower half up over the upper half
// (BookBlock "horizontal"); wider section notes turn right to left around a centre spine.
function orientation(card) {
  return card.closest(".hero") || phone.matches ? "horizontal" : "vertical";
}

function sheet(card, withContent) {
  const page = document.createElement("div");
  page.className = `note-sheet ${card.className}`;
  if (!withContent) return page;
  // Percentage padding would resolve against a different box inside the book, so pin it.
  page.style.padding = getComputedStyle(card).padding;
  for (const child of card.children) {
    if (child.matches(".note-pin, .note-book")) continue;
    const copy = child.cloneNode(true);
    copy.removeAttribute("id");
    for (const node of copy.querySelectorAll("[id]")) node.removeAttribute("id");
    page.append(copy);
  }
  return page;
}

function item(content) {
  const element = document.createElement("div");
  element.className = "bb-item";
  element.append(content);
  return element;
}

// One persistent BookBlock per note: item 1 is a blank sheet, item 2 a snapshot of the note.
// Every turn is a forward next(); circular wraps the exit back to the blank sheet.
export function createBookFlip(card, { speed = TURN_SPEED } = {}) {
  const book = document.createElement("div");
  book.className = "note-book bb-bookblock";
  book.setAttribute("aria-hidden", "true");
  book.inert = true;
  const note = item(sheet(card, false));
  book.append(item(sheet(card, false)), note);
  card.append(book);

  let finish = null;
  // BookBlock merges options into its shared prototype defaults; give this note its own copy.
  const instance = Object.create(BookBlock.prototype);
  instance.defaults = { ...BookBlock.prototype.defaults };
  BookBlock.call(instance, book, {
    speed,
    easing: "ease-in-out",
    shadowSides: 0.25,
    shadowFlip: 0.15,
    circular: true,
    onEndFlip() {
      const done = finish;
      finish = null;
      done?.();
    },
  });

  // Turns stop firing transitionend once the book is hidden, so jump states by hand.
  function settle(showNote) {
    for (const page of book.querySelectorAll(":scope > .bb-page")) page.remove();
    finish = null;
    instance.isAnimating = false;
    instance.end = false;
    instance.currentIdx = showNote ? 1 : 0;
    instance.current = instance.items[instance.currentIdx];
    instance.items.forEach((element, index) => {
      element.style.display = index === instance.currentIdx ? "block" : "none";
    });
  }

  let slide = null;
  function stopSlide() {
    slide?.cancel();
    slide = null;
  }

  function slideTurn(entering, done) {
    const style = getComputedStyle(card);
    const from = { transform: style.transform === "none" ? "translateY(0px)" : style.transform, opacity: style.opacity };
    const fresh = !slide && entering;
    stopSlide();
    const final = entering
      ? { transform: "translateY(0px)", opacity: 1 }
      : { transform: `translateY(${-SLIDE_TRAVEL}px)`, opacity: 0 };
    card.style.transform = final.transform;
    card.style.opacity = String(final.opacity);
    const animation = card.animate(
      [fresh ? { transform: `translateY(${SLIDE_TRAVEL}px)`, opacity: 0 } : from, final],
      { duration: entering ? SLIDE_ENTRY : SLIDE_EXIT, easing: SLIDE_EASING },
    );
    slide = animation;
    animation.onfinish = () => {
      if (slide !== animation) return;
      slide = null;
      if (entering) { card.style.transform = ""; card.style.opacity = ""; }
      done();
    };
  }

  return {
    turn(entering, done) {
      if (slides(card)) {
        settle(!entering);
        card.dataset.turn = "slide";
        slideTurn(entering, done);
        return;
      }
      stopSlide();
      card.style.transform = "";
      card.style.opacity = "";
      card.dataset.turn = "book";
      note.replaceChildren(sheet(card, true));
      settle(!entering);
      // BookBlock reads its orientation only from this class, so it can change per turn.
      const horizontal = orientation(card) === "horizontal";
      book.classList.toggle("bb-horizontal", horizontal);
      book.classList.toggle("bb-vertical", !horizontal);
      const width = book.offsetWidth;
      instance.elWidth = width;
      const span = horizontal ? book.offsetHeight : width;
      book.style.perspective = `${Math.max(1200, Math.round(span * 2.5))}px`;
      finish = done;
      instance.next();
    },
    settle(showNote = true) {
      settle(showNote);
      stopSlide();
      card.dataset.turn = slides(card) ? "slide" : "book";
      card.style.transform = "";
      card.style.opacity = showNote || card.dataset.turn === "book" ? "" : "0";
    },
  };
}

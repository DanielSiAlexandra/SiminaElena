// Codrops BookBlock v2.0.1 (vanilla build, MIT), vendored unmodified from
// https://github.com/codrops/BookBlock at commit 3fcee0a705a1bd59c89ae4ff543cb2e4e7d24330.
import "./modernizr-shim.js";
import "./vendor/bookblock/bookblock.js";
import "./vendor/bookblock/bookblock.css";

const BookBlock = window.BookBlock;
const TURN_SPEED = 1600;

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
// Every turn is a forward (right-to-left) next(); circular wraps the exit back to the blank sheet.
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

  return {
    turn(entering, done) {
      note.replaceChildren(sheet(card, true));
      settle(!entering);
      const width = book.offsetWidth;
      instance.elWidth = width;
      book.style.perspective = `${Math.max(1200, Math.round(width * 2.5))}px`;
      finish = done;
      instance.next();
    },
    settle(showNote = true) { settle(showNote); },
  };
}

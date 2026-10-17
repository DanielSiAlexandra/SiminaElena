import assert from "node:assert/strict";
import test from "node:test";
import { createCardMotion } from "../site/motion.js";

// The page-flip itself belongs to BookBlock (see site/book-flip.js); this controller only
// decides when a note turns in (blank sheet → note) or out (note → blank sheet).
function fixture({ focused = false, random = () => 0.5, flip = true } = {}) {
  const element = { style: {}, dataset: {}, contains: () => focused };
  const turns = [];
  let created = 0;
  let settled = 0;
  let box = { top: 900, bottom: 1200 };
  const callbacks = [];
  let disconnected = 0;
  const controller = createCardMotion([element], {
    watch: callback => { callbacks.push(callback); return () => { disconnected++; }; },
    bounds: () => box,
    viewport: () => 1000,
    activeElement: () => focused ? {} : null,
    random,
    flipper: flip ? () => {
      created++;
      return {
        turn(entering, done) { turns.push({ entering, done }); },
        settle() { settled++; },
      };
    } : null,
  });
  return {
    controller, element, turns, callbacks,
    move(top, bottom = top + 300) { box = { top, bottom }; callbacks.at(-1)(); },
    get created() { return created; },
    get settled() { return settled; },
    get disconnected() { return disconnected; },
  };
}

test("pushpins select only curated colours once, remaining stable across motion restarts", () => {
  for (const [value, expected] of [[0, "sage"], [0.34, "ochre"], [0.99, "clay"]]) {
    let calls = 0;
    const f = fixture({ random: () => { calls++; return value; } });
    assert.equal(f.element.dataset.pinTone, expected);
    f.controller.setEnabled(true);
    f.move(800);
    assert.equal(f.element.dataset.motionState, "entering");
    f.turns.at(-1).done();
    assert.equal(f.element.dataset.motionState, "visible", "Pin reveal follows the completed page turn");
    f.controller.setEnabled(false);
    f.controller.setEnabled(true);
    assert.equal(f.element.dataset.pinTone, expected);
    assert.equal(calls, 1, "Scrolling/preferences must not recolour pins");
  }
});

test("one BookBlock per note, reused across every turn and restart", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  for (let i = 0; i < 3; i++) {
    f.move(800); f.turns.at(-1).done();
    f.move(990); f.turns.at(-1).done();
  }
  f.controller.setEnabled(false);
  f.controller.setEnabled(true);
  f.move(800);
  assert.equal(f.created, 1, "BookBlock leaks a window listener per instance, so never recreate it");
});

test("edge trigger has hysteresis; entry turns the note in and exit turns it out", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  assert.equal(f.element.dataset.motionState, "outside");
  assert.equal(f.turns.length, 0, "Offscreen initialization must not flip");
  f.move(810);
  assert.equal(f.element.dataset.motionState, "entering");
  assert.equal(f.turns[0].entering, true);
  for (const top of [815, 825, 840, 830, 819]) f.move(top);
  assert.equal(f.turns.length, 1, "Boundary jitter must not restart the turn");
  f.turns[0].done();
  f.move(950);
  assert.equal(f.element.dataset.motionState, "visible");
  f.move(981);
  assert.equal(f.element.dataset.motionState, "exiting");
  assert.equal(f.turns.at(-1).entering, false);
  f.turns.at(-1).done();
  assert.equal(f.element.dataset.motionState, "outside");
  f.move(300);
  f.turns.at(-1).done();
  f.move(-100, 190);
  assert.equal(f.element.dataset.motionState, "visible");
  f.move(-100, 170);
  const count = f.turns.length;
  for (const bottom of [180, 220, 270]) f.move(-100, bottom);
  assert.equal(f.turns.length, count, "Top edge jitter must not reverse an exit");
  f.move(-100, 290);
  assert.equal(f.element.dataset.motionState, "entering");
});

test("reversal starts the opposite turn and rejects stale completion", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  f.move(800);
  const entry = f.turns[0];
  f.move(990);
  assert.equal(f.element.dataset.motionState, "exiting");
  assert.equal(f.turns[1].entering, false);
  entry.done();
  assert.equal(f.element.dataset.motionState, "exiting", "Stale entry completion is ignored");
  f.move(800);
  const latest = f.turns.at(-1);
  assert.equal(latest.entering, true);
  f.turns[1].done();
  assert.equal(f.element.dataset.motionState, "entering");
  latest.done();
  assert.equal(f.element.dataset.motionState, "visible");
});

test("oversized cards and completed exits turn back in at either edge", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  for (const [top, bottom] of [[-250, 50], [990, 1290]]) {
    f.move(300);
    f.turns.at(-1).done();
    f.move(top, bottom);
    f.turns.at(-1).done();
    assert.equal(f.element.dataset.motionState, "outside");
    f.move(top < 0 ? -100 : 800, top < 0 ? 320 : 1100);
    assert.equal(f.turns.at(-1).entering, true);
    f.turns.at(-1).done();
  }
  f.move(-100, 3000);
  assert.equal(f.element.dataset.motionState, "visible");
});

test("focus, missing BookBlock and disabled motion leave content visible", () => {
  const f = fixture({ focused: true });
  f.controller.setEnabled(true);
  f.move(-500);
  assert.equal(f.element.dataset.motionState, "visible");
  assert.equal(f.turns.length, 0);
  const g = fixture();
  g.controller.setEnabled(true);
  g.move(800);
  const before = g.settled;
  g.controller.reveal(g.element);
  assert.equal(g.element.dataset.motionState, "visible");
  assert.ok(g.settled > before, "Reveal settles any running page turn");
  g.turns[0].done();
  assert.equal(g.element.dataset.motionState, "visible");
  g.controller.setEnabled(false);
  assert.equal(g.element.dataset.motionState, undefined);
  const none = fixture({ flip: false });
  none.controller.setEnabled(true);
  assert.equal(none.element.dataset.motionState, undefined, "Without BookBlock nothing hides");
  const fallback = createCardMotion([f.element], { watch: null });
  fallback.setEnabled(true);
  assert.equal(f.element.dataset.motionState, undefined);
});

test("teardown rejects queued frames and does not accumulate watchers", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  f.move(800);
  const old = f.callbacks[0];
  f.controller.setEnabled(false);
  old();
  assert.equal(f.element.dataset.motionState, undefined);
  f.controller.setEnabled(true);
  const count = f.turns.length;
  old();
  assert.equal(f.turns.length, count);
  f.controller.destroy();
  assert.equal(f.disconnected, 2);
});

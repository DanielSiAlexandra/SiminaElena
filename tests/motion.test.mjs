import assert from "node:assert/strict";
import test from "node:test";
import { createCardMotion } from "../site/motion.js";

function fixture({ narrow = false, focused = false, random = () => 0.5 } = {}) {
  const animations = [];
  const element = {
    style: {}, dataset: {},
    contains: () => focused,
    animate(frames, options) {
      const animation = { frames, options, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
  };
  let box = { top: 900, bottom: 1200 };
  let appearance = { transform: "none", opacity: "1" };
  const callbacks = [];
  let disconnected = 0;
  const controller = createCardMotion([element], {
    watch: callback => { callbacks.push(callback); return () => { disconnected++; }; },
    bounds: () => box,
    viewport: () => 1000,
    computed: () => appearance,
    activeElement: () => focused ? {} : null,
    narrow: () => narrow,
    random,
  });
  return {
    controller, element, animations, callbacks,
    move(top, bottom = top + 300) { box = { top, bottom }; callbacks.at(-1)(); },
    appearance(value) { appearance = value; },
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
    f.animations.at(-1).onfinish();
    assert.equal(f.element.dataset.motionState, "visible", "Pin reveal follows completed landing");
    f.controller.setEnabled(false);
    f.controller.setEnabled(true);
    assert.equal(f.element.dataset.pinTone, expected);
    assert.equal(calls, 1, "Scrolling/preferences must not recolour pins");
  }
});

test("edge trigger has hysteresis and ignores the card's animated appearance", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  assert.equal(f.element.dataset.motionState, "outside");
  assert.equal(f.animations.length, 0, "Offscreen initialization must not flash");
  f.move(810);
  assert.equal(f.element.dataset.motionState, "entering");
  const entry = f.animations[0];
  assert.deepEqual(entry.frames[0], { transform: "translateY(120px)", opacity: 0 });
  assert.equal(entry.options.duration, 1000);
  f.appearance({ transform: "matrix(1, 0, 0, 1, 0, 115)", opacity: "0.05" });
  for (const top of [815, 825, 840, 830, 819]) f.move(top);
  assert.equal(f.animations.length, 1, "Boundary jitter must not restart animation");
  entry.onfinish();
  f.move(950);
  assert.equal(f.element.dataset.motionState, "visible");
  f.move(981);
  assert.equal(f.element.dataset.motionState, "exiting");
  assert.deepEqual(f.animations.at(-1).frames[1], { transform: "translateY(-120px)", opacity: 0 });
  assert.equal(f.animations.at(-1).options.duration, 750);
  f.animations.at(-1).onfinish();
  f.move(300);
  f.animations.at(-1).onfinish();
  f.move(-100, 190);
  assert.equal(f.element.dataset.motionState, "visible");
  f.move(-100, 170);
  const count = f.animations.length;
  for (const bottom of [180, 220, 270]) f.move(-100, bottom);
  assert.equal(f.animations.length, count, "Top edge jitter must not reverse an exit");
  f.move(-100, 290);
  assert.equal(f.element.dataset.motionState, "entering");
});

test("reversal captures current appearance and rejects stale completion", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  f.move(800);
  const entry = f.animations[0];
  const midway = { transform: "matrix(1, 0, 0, 1, 0, 63)", opacity: "0.5" };
  f.appearance(midway);
  f.move(990);
  assert.ok(entry.cancelled);
  assert.deepEqual(f.animations[1].frames[0], midway);
  entry.onfinish();
  assert.equal(f.element.dataset.motionState, "exiting");
  f.move(800);
  const latest = f.animations.at(-1);
  assert.deepEqual(latest.frames[0], midway);
  latest.onfinish();
  assert.equal(f.element.dataset.motionState, "visible");
  assert.equal(f.element.style.transform, "");
});

test("completed exits re-enter from below at either edge and oversized cards remain visible", () => {
  const f = fixture({ narrow: true });
  f.controller.setEnabled(true);
  for (const [top, bottom] of [[-250, 50], [990, 1290]]) {
    f.move(300);
    f.animations.at(-1).onfinish();
    f.move(top, bottom);
    f.animations.at(-1).onfinish();
    assert.equal(f.element.dataset.motionState, "outside");
    f.move(top < 0 ? -100 : 800, top < 0 ? 320 : 1100);
    assert.deepEqual(f.animations.at(-1).frames[0], { transform: "translateY(80px)", opacity: 0 });
    f.animations.at(-1).onfinish();
  }
  f.move(-100, 3000);
  assert.equal(f.element.dataset.motionState, "visible");
});

test("focus, unsupported APIs and disabled motion leave content visible", () => {
  const f = fixture({ focused: true });
  f.controller.setEnabled(true);
  f.move(-500);
  assert.equal(f.element.dataset.motionState, "visible");
  assert.equal(f.animations.length, 0);
  f.controller.setEnabled(false);
  assert.equal(f.element.style.opacity, "");
  const fallback = createCardMotion([f.element], { watch: null });
  fallback.setEnabled(true);
  assert.equal(f.element.style.transform, "");
  const unsupported = fixture();
  unsupported.element.animate = undefined;
  unsupported.controller.setEnabled(true);
  assert.equal(unsupported.element.style.opacity, "");
});

test("teardown rejects queued frames and does not accumulate watchers", () => {
  const f = fixture();
  f.controller.setEnabled(true);
  f.move(800);
  const old = f.callbacks[0];
  f.controller.setEnabled(false);
  old();
  assert.equal(f.element.style.opacity, "");
  f.controller.setEnabled(true);
  const count = f.animations.length;
  old();
  assert.equal(f.animations.length, count);
  f.controller.destroy();
  assert.equal(f.disconnected, 2);
  assert.equal(f.element.style.transform, "");
});

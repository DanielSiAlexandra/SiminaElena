import assert from "node:assert/strict";
import test from "node:test";
import { createCardMotion } from "../site/motion.js";

function card() {
  const animations = [];
  return {
    style: {},
    dataset: {},
    contains: () => false,
    getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
    animate(frames, options) {
      const animation = { frames, options, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
    animations,
  };
}

test("card enters, exits and re-enters with no stale completion on reversal", () => {
  const element = card();
  let callback;
  const controller = createCardMotion([element], {
    observe: fn => { callback = fn; return { observe() {}, disconnect() {} }; },
    computed: () => ({ transform: "matrix(1, 0, 0, 1, 12, 0)", opacity: "0.5" }),
    activeElement: () => null,
    narrow: () => false,
  });
  controller.setEnabled(true);
  callback([{ target: element, isIntersecting: true, boundingClientRect: { top: 80 } }]);
  assert.equal(element.dataset.motionState, "entering");
  const first = element.animations[0];
  assert.deepEqual(first.frames[0], { transform: "translateY(48px)", opacity: 0 });
  assert.deepEqual(first.frames[1], { transform: "translateY(0px)", opacity: 1 });
  callback([{ target: element, isIntersecting: false, boundingClientRect: { top: -500 } }]);
  assert.ok(first.cancelled);
  assert.equal(element.dataset.motionState, "exiting");
  assert.deepEqual(element.animations.at(-1).frames[1], { transform: "translateY(-48px)", opacity: 0 });
  first.onfinish();
  assert.equal(element.dataset.motionState, "exiting", "Old completion cannot override current state");
  callback([{ target: element, isIntersecting: true, boundingClientRect: { top: -20 } }]);
  assert.equal(element.dataset.motionState, "entering");
  const latest = element.animations.at(-1);
  latest.onfinish();
  assert.equal(element.dataset.motionState, "visible");
  controller.setEnabled(false);
  assert.equal(element.style.transform, "");
  assert.equal(element.style.opacity, "");
});

test("focused cards stay visible, and unsupported animation stays static", () => {
  const element = card();
  let callback;
  const focus = {};
  element.contains = target => target === focus;
  const controller = createCardMotion([element], {
    observe: fn => { callback = fn; return { observe() {}, disconnect() {} }; },
    computed: () => ({ transform: "none", opacity: "1" }),
    activeElement: () => focus,
  });
  controller.setEnabled(true);
  callback([{ target: element, isIntersecting: false, boundingClientRect: { top: -200 } }]);
  assert.equal(element.dataset.motionState, "visible");
  assert.equal(element.animations.length, 0);
  controller.reveal(element);
  assert.equal(element.style.opacity, "");
  const fallback = createCardMotion([card()], { observe: null });
  fallback.setEnabled(true);
  fallback.destroy();
});

test("completed exits re-enter from below in either scroll direction", () => {
  for (const top of [-500, 1200]) {
    const element = card();
    let callback;
    const controller = createCardMotion([element], {
      observe: fn => { callback = fn; return { observe() {}, disconnect() {} }; },
      computed: () => ({ transform: "matrix(1, 0, 0, 1, 0, -20)", opacity: "0" }),
      activeElement: () => null,
      narrow: () => true,
    });
    controller.setEnabled(true);
    callback([{ target: element, isIntersecting: false, boundingClientRect: { top } }]);
    element.animations.at(-1).onfinish();
    callback([{ target: element, isIntersecting: true, boundingClientRect: { top } }]);
    assert.deepEqual(element.animations.at(-1).frames[0], { transform: "translateY(24px)", opacity: 0 });
  }
});

test("observer teardown rejects queued callbacks and restores oversized cards", () => {
  const element = card();
  element.getBoundingClientRect = () => ({ top: -100, bottom: 3000 });
  const callbacks = [];
  let disconnected = 0;
  const controller = createCardMotion([element], {
    observe: callback => {
      callbacks.push(callback);
      return { observe() {}, disconnect() { disconnected += 1; } };
    },
    computed: () => ({ transform: "none", opacity: "1" }),
    activeElement: () => null,
    narrow: () => true,
  });
  controller.setEnabled(true);
  callbacks[0]([{ target: element, isIntersecting: true, boundingClientRect: { top: -100 } }]);
  assert.equal(element.dataset.motionState, "entering");
  controller.setEnabled(false);
  callbacks[0]([{ target: element, isIntersecting: false, boundingClientRect: { top: -4000 } }]);
  assert.equal(element.style.opacity, "");
  controller.setEnabled(true);
  const count = element.animations.length;
  callbacks[0]([{ target: element, isIntersecting: false, boundingClientRect: { top: -4000 } }]);
  assert.equal(element.animations.length, count);
  controller.destroy();
  assert.ok(disconnected >= 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createPen, traceStrokes } from "../site/pen.js";

function fixture() {
  let clock = 0;
  let next = 0;
  const frames = new Map();
  const timers = new Map();
  const drawings = [];
  const positions = [];
  let clears = 0;
  const pen = createPen({
    now: () => clock,
    frame: fn => { const id = ++next; frames.set(id, fn); return id; },
    cancelFrame: id => frames.delete(id),
    later: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: clock + delay }); return id; },
    cancelLater: id => timers.delete(id),
    bounds: () => ({ min: 100, max: 700 }),
    move: (y, tilt) => positions.push({ y, tilt }),
    draw: (progress, phrase, start) => { drawings.push({ progress, phrase, start }); return start + progress * 200; },
    clear: () => { clears += 1; },
  });
  function tick(ms = 16) {
    clock += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(fn => fn(clock));
    for (const [id, timer] of timers) {
      if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    }
  }
  function settle() {
    for (let n = 0; n < 200 && pen.state === "following"; n++) tick();
    assert.equal(pen.state, "waiting");
  }
  return { pen, tick, settle, drawings, positions, frames, timers, get clears() { return clears; } };
}

test("five-second writing deadline begins at settled arrival, not pointer input", () => {
  const f = fixture();
  f.pen.setEnabled(true);
  f.pen.target(600, 8);
  f.tick(4999);
  assert.equal(f.pen.state, "following");
  f.settle();
  f.tick(4999);
  assert.equal(f.pen.state, "waiting");
  assert.equal(f.drawings.length, 0);
  f.tick(1);
  assert.equal(f.pen.state, "writing");
  f.tick(2800);
  assert.equal(f.pen.state, "resting");
  assert.equal(f.drawings.at(-1).progress, 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
});

test("new target interrupts writing, rotates phrases and clamps to the right rail", () => {
  const f = fixture();
  f.pen.setEnabled(true);
  f.settle();
  f.tick(5000);
  f.tick(500);
  assert.equal(f.drawings.at(-1).phrase, 0);
  const oldDraws = f.drawings.length;
  f.pen.target(9000, -99);
  assert.equal(f.pen.state, "following");
  assert.ok(f.clears > 0);
  f.settle();
  assert.equal(f.positions.at(-1).y, 700);
  assert.equal(f.positions.at(-1).tilt, -12);
  f.tick(5000);
  f.tick(16);
  assert.ok(f.drawings.length > oldDraws);
  assert.equal(f.drawings.at(-1).phrase, 1);
});

test("pause, hidden-tab suspension and repositioning cancel all scheduled work", () => {
  const f = fixture();
  f.pen.setEnabled(true);
  f.settle();
  f.pen.setEnabled(false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  f.tick(50000);
  assert.equal(f.drawings.length, 0);
  f.pen.setEnabled(true);
  f.settle();
  f.pen.setVisible(false);
  f.tick(50000);
  assert.equal(f.drawings.length, 0);
  f.pen.setVisible(true);
  f.settle();
  f.tick(4999);
  assert.equal(f.pen.state, "waiting");
  f.pen.reposition();
  assert.equal(f.pen.state, "following");
  f.pen.destroy();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
});

test("handwriting reveals successive complete strokes rather than dashed fragments everywhere", () => {
  assert.deepEqual(traceStrokes([10, 30, 20], 0.25), {
    offsets: [0, 25, 20], index: 1, distance: 5,
  });
  assert.deepEqual(traceStrokes([10, 30, 20], 1), {
    offsets: [0, 0, 0], index: 2, distance: 20,
  });
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function traceStrokes(lengths, progress) {
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * clamp(progress, 0, 1);
  let index = 0;
  let distance = 0;
  const offsets = lengths.map((length, stroke) => {
    const drawn = clamp(remaining, 0, length);
    if (remaining > 0 || stroke === 0) { index = stroke; distance = drawn; }
    remaining -= length;
    return length - drawn;
  });
  return { offsets, index, distance };
}

export function createPen({
  now = () => performance.now(),
  frame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
  later = (callback, delay) => setTimeout(callback, delay),
  cancelLater = id => clearTimeout(id),
  bounds,
  move,
  draw,
  clear,
  change = () => {},
}) {
  let enabled = false;
  let visible = true;
  let state = "parked";
  let y = 180;
  let targetY = y;
  let tilt = 0;
  let targetTilt = 0;
  let frameId;
  let timerId;
  let previousTime = 0;
  let settled = 0;
  let phrase = -1;
  let writingStart = 0;
  let writingY = y;

  function setState(value) { state = value; change(value); }
  function stop() {
    if (frameId !== undefined) cancelFrame(frameId);
    if (timerId !== undefined) cancelLater(timerId);
    frameId = undefined;
    timerId = undefined;
    settled = 0;
    clear();
  }
  function writingFrame(time) {
    frameId = undefined;
    if (!enabled || !visible) return;
    const progress = clamp((time - writingStart) / 2800, 0, 1);
    y = draw(progress, phrase, writingY);
    if (progress < 1) frameId = frame(writingFrame);
    else setState("resting");
  }
  function beginWriting() {
    timerId = undefined;
    if (!enabled || !visible) return;
    phrase = (phrase + 1) % 3;
    writingStart = now();
    writingY = y;
    setState("writing");
    y = draw(0, phrase, writingY);
    frameId = frame(writingFrame);
  }
  function follow(time) {
    frameId = undefined;
    if (!enabled || !visible) return;
    const dt = clamp(time - previousTime, 1, 32);
    previousTime = time;
    const factor = 1 - Math.exp(-dt / 85);
    y += (targetY - y) * factor;
    tilt += (targetTilt - tilt) * factor;
    move(y, tilt);
    if (Math.abs(targetY - y) < 0.5 && Math.abs(targetTilt - tilt) < 0.5) settled += 1;
    else settled = 0;
    if (settled >= 3) {
      y = targetY;
      tilt = targetTilt;
      move(y, tilt);
      setState("waiting");
      timerId = later(beginWriting, 5000);
    } else frameId = frame(follow);
  }
  function start() {
    stop();
    const { min, max } = bounds();
    targetY = clamp(targetY, min, max);
    y = clamp(y, min, max);
    if (!enabled || !visible) { setState("parked"); return; }
    setState("following");
    previousTime = now();
    frameId = frame(follow);
  }
  return {
    get state() { return state; },
    target(value, angle = 0) {
      const { min, max } = bounds();
      targetY = clamp(value, min, max);
      targetTilt = clamp(angle, -12, 12);
      start();
    },
    reposition() { start(); },
    setEnabled(value) {
      enabled = value;
      if (!value) {
        targetY = 160;
        targetTilt = 0;
        y = 160;
        tilt = 0;
        move(y, tilt);
      }
      start();
    },
    setVisible(value) { visible = value; start(); },
    destroy() { enabled = false; stop(); setState("parked"); },
  };
}

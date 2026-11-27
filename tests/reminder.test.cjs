const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../model.js");

function timerFixture() {
  const pending = new Map();
  let id = 0;
  let fired = 0;
  const timer = model.createReminderTimer({
    schedule(callback, delay) {
      pending.set(++id, { callback, delay });
      return id;
    },
    cancel: key => pending.delete(key),
    onReminder: () => { fired += 1; }
  });
  return {
    timer,
    pending,
    get fired() { return fired; },
    runNext() {
      const [key, task] = pending.entries().next().value;
      pending.delete(key);
      task.callback();
    }
  };
}

test("starts disabled with the interval set to 60 minutes", () => {
  const settings = model.createState().reminders;
  const { timer, pending } = timerFixture();
  timer.update(settings);
  assert.deepEqual(settings, { enabled: false, minutes: 60 });
  assert.equal(pending.size, 0);
});

test("supports all three intervals and repeats without accumulating timers", () => {
  for (const minutes of [30, 60, 120]) {
    const fixture = timerFixture();
    fixture.timer.update({ enabled: true, minutes });
    assert.equal(fixture.pending.size, 1);
    assert.equal(fixture.pending.values().next().value.delay, minutes * 60000);
    fixture.runNext();
    fixture.runNext();
    assert.equal(fixture.fired, 2);
    assert.equal(fixture.pending.size, 1);
    assert.equal(fixture.pending.values().next().value.delay, minutes * 60000);
  }
});

test("keeps the timer on an unchanged setting and restarts on interval change", () => {
  const { timer, pending } = timerFixture();
  timer.update({ enabled: true, minutes: 30 });
  const first = pending.keys().next().value;
  timer.update({ enabled: true, minutes: 30 });
  assert.deepEqual([...pending.keys()], [first]);
  timer.update({ enabled: true, minutes: 120 });
  assert.equal(pending.has(first), false);
  assert.equal(pending.size, 1);
  assert.equal(pending.values().next().value.delay, 7200000);
});

test("disabling cancels the timer and re-enabling starts a new interval", () => {
  const { timer, pending } = timerFixture();
  timer.update({ enabled: true, minutes: 60 });
  const first = pending.keys().next().value;
  timer.update({ enabled: false, minutes: 60 });
  assert.equal(pending.size, 0);
  timer.update({ enabled: true, minutes: 60 });
  assert.equal(pending.size, 1);
  assert.equal(pending.has(first), false);
});

test("restores reminder settings and starts a fresh timer after reopening", () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_, data) => { value = data; } };
  const settings = { enabled: true, minutes: 30 };
  model.writeState(storage, { ...model.createState(), reminders: settings });
  const loaded = model.readState(storage);
  assert.deepEqual(loaded.reminders, settings);
  const { timer, pending } = timerFixture();
  timer.update(loaded.reminders);
  assert.equal(pending.values().next().value.delay, 1800000);
});

test("invalid or missing reminder data falls back to defaults", () => {
  assert.deepEqual(model.reminderSettings({ enabled: "true", minutes: 90 }),
    { enabled: false, minutes: 60 });
  assert.deepEqual(model.reminderSettings(), { enabled: false, minutes: 60 });
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../model.js");

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
}

const morning = new Date(2026, 10, 27, 9);
const evening = new Date(2026, 10, 27, 20);
const tomorrow = new Date(2026, 10, 28, 0);

test("accepts only integer volume between 1 and 2000 ml", () => {
  assert.equal(model.parseAmount("1"), 1);
  assert.equal(model.parseAmount(" 2000 "), 2000);
  for (const value of ["", " ", "0", "2001", "-5", "1.5", "2,5", "1e3", "вода"]) {
    assert.equal(model.parseAmount(value), null, value);
  }
});

test("sums today's entries in reverse time order and preserves yesterday's entries", () => {
  let state = model.addEntry(model.createState(), 250, +morning);
  state = model.addEntry(state, 500, +evening);
  const today = model.getDay(state, evening);
  assert.equal(today.total, 750);
  assert.deepEqual(today.entries.map(entry => entry.amount), [500, 250]);
  assert.equal(model.getDay(state, tomorrow).total, 0);
  assert.equal(state.entries.length, 2);
});

test("removes only the requested entry on the current day", () => {
  let state = model.addEntry(model.createState(), 250, +morning);
  state = model.addEntry(state, 500, +evening);
  assert.equal(model.getDay(model.removeEntry(state, 1, evening), evening).total, 500);
  assert.deepEqual(model.removeEntry(state, 1, tomorrow), state);
});

test("uses the next local midnight even across a month boundary", () => {
  const lastDay = new Date(2026, 10, 30, 23, 59, 59, 950);
  assert.equal(model.nextMidnight(lastDay), +new Date(2026, 11, 1));
});

test("saves and restores entries and deletions", () => {
  const storage = memoryStorage();
  const state = model.addEntry(model.readState(storage), 250, +morning);
  model.writeState(storage, state);
  assert.deepEqual(model.readState(storage), state);
  const deleted = model.removeEntry(state, 1, evening);
  model.writeState(storage, deleted);
  assert.deepEqual(model.readState(storage), deleted);
});

test("reports unreadable and unwritable storage to the caller", () => {
  const storage = memoryStorage();
  storage.setItem(model.STORAGE_KEY, "broken JSON");
  assert.throws(() => model.readState(storage), SyntaxError);
  assert.throws(
    () => model.writeState({ setItem() { throw new Error("full"); } }, model.createState()),
    /full/
  );
});

test("calculates a day with 1000 entries", () => {
  const entries = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1, amount: 250, at: +morning + index
  }));
  const state = model.addEntry({ entries }, 500, +evening);
  assert.equal(model.getDay(state, evening).total, 250500);
});

test("validates goal boundaries separately from one entry", () => {
  assert.equal(model.parseGoal("1"), 1);
  assert.equal(model.parseGoal("10000"), 10000);
  for (const value of ["0", "10001", "", "2.5", "1e3"]) {
    assert.equal(model.parseGoal(value), null, value);
  }
});

test("rounds daily progress and reports values above 100 percent", () => {
  assert.equal(model.getProgress(750, null), null);
  assert.deepEqual(model.getProgress(750, 2000), { percent: 38, reached: false });
  assert.deepEqual(model.getProgress(1999, 2000), { percent: 100, reached: false });
  assert.deepEqual(model.getProgress(2000, 2000), { percent: 100, reached: true });
  assert.deepEqual(model.getProgress(2200, 2000), { percent: 110, reached: true });
});

test("loads a journal saved before the goal was introduced", () => {
  const storage = memoryStorage();
  const entries = [{ id: 1, at: +morning, amount: 750 }];
  storage.setItem(model.STORAGE_KEY, JSON.stringify({ entries }));
  assert.deepEqual(model.readState(storage), { ...model.createState(), entries });
});

test("restores the goal after reload and keeps it at midnight", () => {
  const storage = memoryStorage();
  const state = model.addEntry({ ...model.createState(), goal: 2000 }, 750, +morning);
  model.writeState(storage, state);
  const loaded = model.readState(storage);
  assert.equal(loaded.goal, 2000);
  assert.deepEqual(model.getProgress(model.getDay(loaded, tomorrow).total, loaded.goal),
    { percent: 0, reached: false });
});

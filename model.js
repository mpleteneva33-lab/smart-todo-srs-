"use strict";

(function () {
  const STORAGE_KEY = "water-tracker-v1";

  function parseMilliliters(value, max) {
    const text = value.trim();
    if (!/^[0-9]+$/.test(text)) return null;
    const number = Number(text);
    return number >= 1 && number <= max ? number : null;
  }

  function parseAmount(value) {
    return parseMilliliters(value, 2000);
  }

  function parseGoal(value) {
    return parseMilliliters(value, 10000);
  }

  function getProgress(total, goal) {
    if (goal === null) return null;
    return { percent: Math.round(100 * total / goal), reached: total >= goal };
  }

  function createState() {
    return { entries: [], goal: null };
  }

  function readState(storage) {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved === null) return createState();

    const data = JSON.parse(saved);
    if (!Array.isArray(data?.entries)) throw new Error("Invalid saved journal");
    const entries = data.entries.filter(entry =>
      Number.isSafeInteger(entry?.id) && entry.id > 0 &&
      Number.isInteger(entry.amount) && entry.amount >= 1 && entry.amount <= 2000 &&
      Number.isFinite(entry.at) && Math.abs(entry.at) <= 8.64e15
    );
    const goal = Number.isInteger(data.goal) ? parseGoal(String(data.goal)) : null;
    return { entries, goal };
  }

  function writeState(storage, state) {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function dayKey(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
  }

  function getDay(state, now) {
    const key = dayKey(now);
    const entries = state.entries.filter(entry => dayKey(new Date(entry.at)) === key);
    entries.sort((a, b) => b.at - a.at || b.id - a.id);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return { entries, total };
  }

  function addEntry(state, amount, at) {
    const id = state.entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
    return { ...state, entries: [...state.entries, { id, amount, at }] };
  }

  function removeEntry(state, id, now) {
    const date = dayKey(now);
    return {
      ...state,
      entries: state.entries.filter(entry =>
        entry.id !== id || dayKey(new Date(entry.at)) !== date
      )
    };
  }

  function nextMidnight(now) {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  const model = {
    STORAGE_KEY, parseAmount, parseGoal, getProgress, createState, readState, writeState,
    dayKey, getDay, addEntry, removeEntry, nextMidnight
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = model;
  } else {
    window.WaterTracker = model;
  }
})();

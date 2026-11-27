"use strict";

const tracker = window.WaterTracker;
const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long", day: "numeric", month: "long"
});
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit", minute: "2-digit"
});

const storageError = byId("storage-error");
const waterAmount = byId("water-amount");
const deleteDialog = byId("delete-dialog");
const entriesList = byId("entries");

let state = tracker.createState();
let displayedDay;
let midnightTimer;
let pendingDelete;
let deleteButton;

function showStorageError(message) {
  storageError.textContent = message;
  storageError.hidden = false;
}

function readSavedState() {
  try {
    state = tracker.readState(window.localStorage);
  } catch {
    showStorageError("Не удалось загрузить сохранённые данные.");
  }
}

function save(nextState) {
  state = nextState;
  try {
    tracker.writeState(window.localStorage, state);
    storageError.hidden = true;
  } catch {
    showStorageError("Не удалось сохранить данные");
  }
}

function setFieldError(input, hint, message = "") {
  hint.textContent = message;
  hint.hidden = !message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
  } else {
    input.removeAttribute("aria-invalid");
  }
}

function renderJournal(now = new Date()) {
  displayedDay = tracker.dayKey(now);
  byId("today-date").textContent = dateFormat.format(now);

  const day = tracker.getDay(state, now);
  byId("total").textContent = number.format(day.total);
  byId("empty").hidden = day.entries.length > 0;

  const rows = document.createDocumentFragment();
  for (const entry of day.entries) {
    const row = document.createElement("li");
    const data = document.createElement("span");
    data.className = "entry-data";
    const amount = document.createElement("strong");
    amount.textContent = number.format(entry.amount) + " мл";
    const time = document.createElement("time");
    const stamp = new Date(entry.at);
    time.dateTime = stamp.toISOString();
    time.textContent = timeFormat.format(stamp);
    data.append(amount, time);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Удалить";
    remove.setAttribute("aria-label", "Удалить " + amount.textContent + ", " + time.textContent);
    remove.addEventListener("click", () => {
      pendingDelete = entry.id;
      deleteButton = remove;
      byId("delete-description").textContent = amount.textContent + " · " + time.textContent;
      deleteDialog.returnValue = "";
      deleteDialog.showModal();
    });
    row.append(data, remove);
    rows.append(row);
  }
  entriesList.replaceChildren(rows);
}

function refreshDay() {
  const now = new Date();
  if (displayedDay !== tracker.dayKey(now)) renderJournal(now);
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(refreshDay, tracker.nextMidnight(now) - now.getTime());
}

const waterError = byId("water-error");
waterAmount.addEventListener("input", () => setFieldError(waterAmount, waterError));
byId("water-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = tracker.parseAmount(waterAmount.value);
  if (amount === null) {
    setFieldError(waterAmount, waterError, "Введите целое число от 1 до 2 000 мл.");
    return;
  }
  setFieldError(waterAmount, waterError);
  save(tracker.addEntry(state, amount, Date.now()));
  waterAmount.value = "";
  renderJournal();
  waterAmount.focus();
});

deleteDialog.addEventListener("close", () => {
  if (deleteDialog.returnValue === "delete") {
    save(tracker.removeEntry(state, pendingDelete, new Date()));
    renderJournal();
    const nextDelete = entriesList.querySelector("button");
    (nextDelete ?? waterAmount).focus();
  } else if (deleteButton?.isConnected) {
    deleteButton.focus();
  }
  deleteButton = null;
  pendingDelete = null;
});

window.addEventListener("focus", refreshDay);
document.addEventListener("visibilitychange", refreshDay);
window.addEventListener("storage", (event) => {
  if (event.key === tracker.STORAGE_KEY || event.key === null) {
    readSavedState();
    renderJournal();
  }
});

readSavedState();
refreshDay();

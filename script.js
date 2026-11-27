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
const goalAmount = byId("goal-amount");
const deleteDialog = byId("delete-dialog");
const entriesList = byId("entries");
const remindersEnabled = byId("reminders-enabled");
const reminderInterval = byId("reminder-interval");
const reminderBanner = byId("reminder");
const reminderText = byId("reminder-text");
const reminderTimer = tracker.createReminderTimer({
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (timer) => window.clearTimeout(timer),
  onReminder: () => {
    if (document.hidden || !reminderBanner.hidden) return;
    reminderBanner.hidden = false;
    reminderText.textContent = "Пора выпить воды";
  }
});

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
    goalAmount.value = state.goal ?? "";
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
  renderProgress(day.total);

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

function renderProgress(total) {
  const progress = tracker.getProgress(total, state.goal);
  byId("goal-prompt").hidden = progress !== null;
  byId("goal-progress").hidden = progress === null;
  if (progress === null) return;

  byId("goal-total").textContent = number.format(state.goal);
  byId("goal-percent").textContent = number.format(progress.percent) + "%";
  byId("progress").value = Math.min(100, progress.percent);
  byId("goal-reached").hidden = !progress.reached;
}

function renderReminders() {
  remindersEnabled.checked = state.reminders.enabled;
  reminderInterval.value = state.reminders.minutes;
  if (!state.reminders.enabled) reminderBanner.hidden = true;
  reminderTimer.update(state.reminders);
}

function saveReminders() {
  const reminders = tracker.reminderSettings({
    enabled: remindersEnabled.checked,
    minutes: Number(reminderInterval.value)
  });
  save({ ...state, reminders });
  reminderBanner.hidden = true;
  renderReminders();
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

const goalError = byId("goal-error");
goalAmount.addEventListener("input", () => setFieldError(goalAmount, goalError));
byId("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = tracker.parseGoal(goalAmount.value);
  if (goal === null) {
    setFieldError(goalAmount, goalError, "Введите целое число от 1 до 10 000 мл.");
    return;
  }
  setFieldError(goalAmount, goalError);
  save({ ...state, goal });
  goalAmount.value = goal;
  renderProgress(tracker.getDay(state, new Date()).total);
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

remindersEnabled.addEventListener("change", saveReminders);
reminderInterval.addEventListener("change", saveReminders);
byId("close-reminder").addEventListener("click", () => {
  reminderBanner.hidden = true;
  waterAmount.focus();
});

window.addEventListener("focus", refreshDay);
document.addEventListener("visibilitychange", refreshDay);
window.addEventListener("storage", (event) => {
  if (event.key === tracker.STORAGE_KEY || event.key === null) {
    readSavedState();
    renderJournal();
    renderReminders();
  }
});

readSavedState();
renderReminders();
refreshDay();

const STORAGE_KEY = "flow-log-events-v1";
const LAST_EXPORT_KEY = "flow-log-last-export-v1";
const BACKUP_REMINDER_DAYS = 30;
const BACKUP_REMINDER_MIN_EVENTS = 20;
const TOAST_MS = 4000;

const initialEvents = loadEvents();

const state = {
  events: initialEvents,
  selectedDate: getInitialSelectedDate(initialEvents),
  toastTimer: null,
  toastAction: null,
};

const elements = {
  selectedDatePill: document.querySelector("#selected-date-pill"),
  waterButton: document.querySelector("#water-button"),
  peeButton: document.querySelector("#pee-button"),
  numberTwoButton: document.querySelector("#number-two-button"),
  exportButton: document.querySelector("#export-button"),
  importButton: document.querySelector("#import-button"),
  importFileInput: document.querySelector("#import-file-input"),
  backupStatus: document.querySelector("#backup-status"),
  backupHint: document.querySelector("#backup-hint"),
  updateBanner: document.querySelector("#update-banner"),
  updateButton: document.querySelector("#update-button"),
  todayMeta: document.querySelector("#today-meta"),
  todayWaterCount: document.querySelector("#today-water-count"),
  todayPeeCount: document.querySelector("#today-pee-count"),
  todayNumberTwoCount: document.querySelector("#today-number-two-count"),
  todayWaterLast: document.querySelector("#today-water-last"),
  todayPeeLast: document.querySelector("#today-pee-last"),
  todayNumberTwoLast: document.querySelector("#today-number-two-last"),
  todayPeeGap: document.querySelector("#today-pee-gap"),
  todayPeeGapDetail: document.querySelector("#today-pee-gap-detail"),
  histogramList: document.querySelector("#weekly-histogram"),
  histogramBarTemplate: document.querySelector("#histogram-bar-template"),
  archiveCount: document.querySelector("#archive-count"),
  archiveEmpty: document.querySelector("#archive-empty"),
  daySummaryList: document.querySelector("#day-summary-list"),
  daySummaryTemplate: document.querySelector("#day-summary-template"),
  jumpTodayButton: document.querySelector("#jump-today-button"),
  previousDayButton: document.querySelector("#previous-day-button"),
  nextDayButton: document.querySelector("#next-day-button"),
  dayInput: document.querySelector("#day-input"),
  selectedDayHeading: document.querySelector("#selected-day-heading"),
  selectedWaterCount: document.querySelector("#selected-water-count"),
  selectedPeeCount: document.querySelector("#selected-pee-count"),
  selectedNumberTwoCount: document.querySelector("#selected-number-two-count"),
  selectedWaterLast: document.querySelector("#selected-water-last"),
  selectedPeeLast: document.querySelector("#selected-pee-last"),
  selectedNumberTwoLast: document.querySelector("#selected-number-two-last"),
  selectedPeeGap: document.querySelector("#selected-pee-gap"),
  selectedPeeGapDetail: document.querySelector("#selected-pee-gap-detail"),
  historyHeading: document.querySelector("#history-heading"),
  clearDayButton: document.querySelector("#clear-day-button"),
  emptyState: document.querySelector("#empty-state"),
  historyList: document.querySelector("#history-list"),
  historyItemTemplate: document.querySelector("#history-item-template"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  undoButton: document.querySelector("#undo-button"),
};

elements.waterButton.addEventListener("click", () => addEvent("water"));
elements.peeButton.addEventListener("click", () => addEvent("pee"));
elements.numberTwoButton.addEventListener("click", () => addEvent("number2"));
elements.exportButton.addEventListener("click", exportBackup);
elements.importButton.addEventListener("click", promptImport);
elements.importFileInput.addEventListener("change", importBackupFromFile);
elements.jumpTodayButton.addEventListener("click", jumpToToday);
elements.previousDayButton.addEventListener("click", () => shiftSelectedDay(-1));
elements.nextDayButton.addEventListener("click", () => shiftSelectedDay(1));
elements.dayInput.addEventListener("change", onDayInputChange);
elements.clearDayButton.addEventListener("click", clearSelectedDay);
elements.undoButton.addEventListener("click", runToastAction);
elements.updateButton.addEventListener("click", () => window.location.reload());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => watchForUpdates(registration))
      .catch(() => {});
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) {
      return;
    }
    hasReloaded = true;
    window.location.reload();
  });
}

render();

function watchForUpdates(registration) {
  if (!registration) {
    return;
  }

  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) {
      return;
    }

    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateBanner(installing);
      }
    });
  });
}

function showUpdateBanner(worker) {
  if (!elements.updateBanner) {
    return;
  }
  elements.updateBanner.hidden = false;
  elements.updateButton.onclick = () => {
    elements.updateButton.disabled = true;
    worker.postMessage({ type: "SKIP_WAITING" });
    // controllerchange listener will reload; fallback in case message is ignored
    window.setTimeout(() => window.location.reload(), 800);
  };
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          typeof entry.type === "string" &&
          typeof entry.timestamp === "number"
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

function getInitialSelectedDate(events) {
  if (events.length > 0) {
    return formatDateKey(events[0].timestamp);
  }

  return formatDateKey(Date.now());
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
}

function addEvent(type) {
  const event = {
    id: createId(),
    type,
    timestamp: Date.now(),
  };

  state.selectedDate = formatDateKey(event.timestamp);
  state.events.unshift(event);
  saveEvents();
  render();
  showToast(`${labelForToast(type)} logged.`, "Undo", () => {
    state.events = state.events.filter((entry) => entry.id !== event.id);
    saveEvents();
    render();
  });
}

function deleteEvent(eventId) {
  const index = state.events.findIndex((event) => event.id === eventId);
  if (index === -1) {
    return;
  }

  const [removed] = state.events.splice(index, 1);
  saveEvents();
  render();
  showToast("Entry removed.", "Undo", () => {
    state.events.unshift(removed);
    state.events.sort((a, b) => b.timestamp - a.timestamp);
    saveEvents();
    render();
  });
}

function clearSelectedDay() {
  const selectedEvents = getSelectedDayEvents();
  if (selectedEvents.length === 0) {
    return;
  }

  const confirmed = window.confirm(`Clear all entries for ${formatLongDate(state.selectedDate)}?`);
  if (!confirmed) {
    return;
  }

  const selectedIds = new Set(selectedEvents.map((event) => event.id));
  state.events = state.events.filter((event) => !selectedIds.has(event.id));
  saveEvents();
  render();
  showToast("Day cleared.");
}

function onDayInputChange() {
  if (!elements.dayInput.value) {
    return;
  }

  state.selectedDate = elements.dayInput.value;
  render();
}

function shiftSelectedDay(days) {
  const nextDate = createLocalDate(state.selectedDate, 12);
  nextDate.setDate(nextDate.getDate() + days);
  state.selectedDate = formatDateKey(nextDate.getTime());
  render();
}

function jumpToToday() {
  state.selectedDate = formatDateKey(Date.now());
  render();
}

function showToast(message, actionLabel = "", action = null) {
  clearTimeout(state.toastTimer);
  elements.toastMessage.textContent = message;
  elements.toast.hidden = false;
  elements.undoButton.hidden = !action;
  elements.undoButton.textContent = actionLabel;
  state.toastAction = action;
  state.toastTimer = window.setTimeout(hideToast, TOAST_MS);
}

function runToastAction() {
  if (!state.toastAction) {
    hideToast();
    return;
  }

  const action = state.toastAction;
  hideToast();
  action();
}

function hideToast() {
  clearTimeout(state.toastTimer);
  state.toastAction = null;
  elements.toast.hidden = true;
}

function exportBackup() {
  const now = new Date();
  const payload = {
    app: "Flow Log",
    version: 1,
    exportedAt: now.toISOString(),
    events: state.events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  anchor.href = url;
  anchor.download = `flow-log-backup-${formatDateKey(now.getTime())}-${hours}${minutes}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(now.getTime()));
  } catch {}

  setBackupStatus("Backup exported. Keep the file somewhere safe.");
  renderBackupHint();
  showToast("Backup exported.");
}

function promptImport() {
  elements.importFileInput.click();
}

async function importBackupFromFile(event) {
  const [file] = event.target.files || [];
  elements.importFileInput.value = "";

  if (!file) {
    return;
  }

  setImportBusy(true);
  setBackupStatus("Reading backup…");

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const importedEvents = normalizeImportedEvents(parsed);

    if (importedEvents.length === 0) {
      setBackupStatus("That file did not contain any usable logs.");
      showToast("No logs imported.");
      return;
    }

    const existingCount = state.events.length;
    const mergedById = new Map();

    for (const entry of state.events) {
      mergedById.set(entry.id, entry);
    }

    for (const entry of importedEvents) {
      mergedById.set(entry.id, entry);
    }

    state.events = Array.from(mergedById.values()).sort((a, b) => b.timestamp - a.timestamp);
    if (existingCount === 0 && state.events.length > 0) {
      state.selectedDate = formatDateKey(state.events[0].timestamp);
    }
    saveEvents();
    render();

    const newCount = state.events.length - existingCount;
    const message =
      newCount > 0
        ? `Imported ${formatCountLabel(newCount, "new log")}.`
        : "That backup was already in this app.";

    setBackupStatus(message);
    showToast(newCount > 0 ? "Backup imported." : "Backup already here.");
  } catch {
    setBackupStatus("That file could not be read. Try a Flow Log backup JSON file.");
    showToast("Import failed.");
  } finally {
    setImportBusy(false);
  }
}

function setImportBusy(isBusy) {
  if (!elements.importButton || !elements.exportButton) {
    return;
  }
  elements.importButton.setAttribute("aria-busy", isBusy ? "true" : "false");
  elements.exportButton.setAttribute("aria-busy", isBusy ? "true" : "false");
  elements.importButton.disabled = isBusy;
  elements.exportButton.disabled = isBusy;
}

function renderBackupHint() {
  if (!elements.backupHint) {
    return;
  }

  const eventCount = state.events.length;
  if (eventCount < BACKUP_REMINDER_MIN_EVENTS) {
    elements.backupHint.hidden = true;
    elements.backupHint.textContent = "";
    return;
  }

  let lastExport = 0;
  try {
    lastExport = Number(localStorage.getItem(LAST_EXPORT_KEY)) || 0;
  } catch {}

  const msSinceExport = Date.now() - lastExport;
  const daysSinceExport = msSinceExport / (1000 * 60 * 60 * 24);

  if (lastExport === 0) {
    elements.backupHint.hidden = false;
    elements.backupHint.textContent = `You have ${eventCount} logs saved and no backup yet. Export one now?`;
    return;
  }

  if (daysSinceExport >= BACKUP_REMINDER_DAYS) {
    const daysAgo = Math.round(daysSinceExport);
    elements.backupHint.hidden = false;
    elements.backupHint.textContent = `Last backup was ${daysAgo} days ago. Time for a fresh export.`;
    return;
  }

  elements.backupHint.hidden = true;
  elements.backupHint.textContent = "";
}

function render() {
  const daySummaries = buildDaySummaries();
  const todaySummary = getSummaryForDate(daySummaries, formatDateKey(Date.now()));
  const selectedSummary = getSummaryForDate(daySummaries, state.selectedDate);

  renderHeader();
  renderTodayDashboard(todaySummary);
  renderWeeklyHistogram(daySummaries);
  renderArchive(daySummaries);
  renderSelectedDay(selectedSummary);
  renderHistory(selectedSummary);
  renderBackupHint();
}

function renderHeader() {
  const todayKey = formatDateKey(Date.now());
  elements.selectedDatePill.textContent = formatChipDate(state.selectedDate);
  elements.dayInput.value = state.selectedDate;
  elements.jumpTodayButton.disabled = state.selectedDate === todayKey;
  elements.nextDayButton.disabled = state.selectedDate >= todayKey;
  elements.selectedDayHeading.textContent = formatLongDate(state.selectedDate);
  elements.historyHeading.textContent = formatLongDate(state.selectedDate);
}

function renderTodayDashboard(summary) {
  elements.todayMeta.textContent = `${formatCountLabel(summary.totalCount, "log")} today`;
  elements.todayWaterCount.textContent = String(summary.counts.water);
  elements.todayPeeCount.textContent = String(summary.counts.pee);
  elements.todayNumberTwoCount.textContent = String(summary.counts.number2);
  elements.todayWaterLast.textContent = formatLastEvent(summary.lastByType.water, "No water yet");
  elements.todayPeeLast.textContent = formatLastEvent(summary.lastByType.pee, "No pee yet");
  elements.todayNumberTwoLast.textContent = formatLastEvent(
    summary.lastByType.number2,
    "No #2 yet"
  );
  elements.todayPeeGap.textContent = summary.peeGapMs ? formatCompactDuration(summary.peeGapMs) : "-";
  elements.todayPeeGapDetail.textContent = summary.peeGapMs
    ? "Between the latest two pee logs"
    : "Log two pee events to see the gap";
}

function renderWeeklyHistogram(daySummaries) {
  const weeklySummaries = buildRecentWindow(daySummaries, 7);
  const maxTotal = Math.max(
    ...weeklySummaries.map((summary) => summary.totalCount),
    1
  );

  elements.histogramList.textContent = "";

  for (const summary of weeklySummaries) {
    const item = elements.histogramBarTemplate.content.firstElementChild.cloneNode(true);
    const button = item.querySelector(".histogram-button");
    const total = item.querySelector(".histogram-total");
    const frame = item.querySelector(".histogram-frame");
    const stack = item.querySelector(".histogram-stack");
    const water = item.querySelector(".histogram-water");
    const pee = item.querySelector(".histogram-pee");
    const numberTwo = item.querySelector(".histogram-number-two");
    const label = item.querySelector(".histogram-label");

    const totalCount = summary.totalCount;
    const heightPct = totalCount === 0 ? 0 : Math.max((totalCount / maxTotal) * 100, 12);

    total.textContent = String(totalCount);
    label.textContent = formatShortDay(summary.dateKey);
    stack.style.setProperty("--bar-height", `${heightPct}%`);
    stack.style.setProperty("--bar-min-height", totalCount > 0 ? "0.6rem" : "0");
    water.style.height = segmentPercent(summary.counts.water, totalCount);
    pee.style.height = segmentPercent(summary.counts.pee, totalCount);
    numberTwo.style.height = segmentPercent(summary.counts.number2, totalCount);
    water.hidden = summary.counts.water === 0;
    pee.hidden = summary.counts.pee === 0;
    numberTwo.hidden = summary.counts.number2 === 0;

    if (summary.dateKey === state.selectedDate) {
      button.classList.add("is-selected");
    }

    button.setAttribute(
      "aria-label",
      `${formatLongDate(summary.dateKey)}: ${summary.counts.water} water, ${summary.counts.pee} pee, ${summary.counts.number2} number two`
    );
    button.addEventListener("click", () => {
      state.selectedDate = summary.dateKey;
      render();
    });

    frame.title = formatLongDate(summary.dateKey);
    elements.histogramList.appendChild(item);
  }
}

function renderArchive(daySummaries) {
  elements.daySummaryList.textContent = "";
  elements.archiveCount.textContent = formatCountLabel(daySummaries.length, "day");
  elements.archiveEmpty.hidden = daySummaries.length > 0;

  for (const summary of daySummaries) {
    const item = elements.daySummaryTemplate.content.firstElementChild.cloneNode(true);
    const button = item.querySelector(".day-summary-button");
    const title = item.querySelector(".day-summary-title");
    const subtitle = item.querySelector(".day-summary-subtitle");
    const total = item.querySelector(".day-summary-total");
    const water = item.querySelector(".mini-water");
    const pee = item.querySelector(".mini-pee");
    const numberTwo = item.querySelector(".mini-number-two");
    const gap = item.querySelector(".mini-gap");

    title.textContent = formatArchiveTitle(summary.dateKey);
    subtitle.textContent = summary.lastEvent
      ? `Last log ${formatClockTime(summary.lastEvent.timestamp)}`
      : "No logs";
    total.textContent = formatCountLabel(summary.totalCount, "log");
    water.textContent = `💧 ${summary.counts.water}`;
    pee.textContent = `🚽 ${summary.counts.pee}`;
    numberTwo.textContent = `💩 ${summary.counts.number2}`;
    gap.textContent = summary.peeGapMs
      ? `gap ${formatCompactDuration(summary.peeGapMs)}`
      : "gap -";

    if (summary.dateKey === state.selectedDate) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      state.selectedDate = summary.dateKey;
      render();
    });

    elements.daySummaryList.appendChild(item);
  }
}

function renderSelectedDay(summary) {
  elements.selectedWaterCount.textContent = String(summary.counts.water);
  elements.selectedPeeCount.textContent = String(summary.counts.pee);
  elements.selectedNumberTwoCount.textContent = String(summary.counts.number2);
  elements.selectedWaterLast.textContent = formatLastEvent(summary.lastByType.water, "No water yet");
  elements.selectedPeeLast.textContent = formatLastEvent(summary.lastByType.pee, "No pee yet");
  elements.selectedNumberTwoLast.textContent = formatLastEvent(
    summary.lastByType.number2,
    "No #2 yet"
  );
  elements.selectedPeeGap.textContent = summary.peeGapMs
    ? formatCompactDuration(summary.peeGapMs)
    : "-";
  elements.selectedPeeGapDetail.textContent = summary.peeGapMs
    ? "Between the latest two pee logs"
    : "Log two pee events to see the gap";
  elements.clearDayButton.disabled = summary.events.length === 0;
}

function renderHistory(summary) {
  elements.historyList.textContent = "";
  elements.emptyState.hidden = summary.events.length > 0;

  for (const event of summary.events) {
    const item = elements.historyItemTemplate.content.firstElementChild.cloneNode(true);
    const leading = item.querySelector(".history-leading");
    const title = item.querySelector(".history-title");
    const meta = item.querySelector(".history-meta");
    const deleteButton = item.querySelector(".delete-button");

    leading.classList.add(leadingClassForType(event.type));
    title.textContent = labelForHistory(event.type);
    meta.textContent = formatClockTime(event.timestamp);
    deleteButton.addEventListener("click", () => deleteEvent(event.id));

    elements.historyList.appendChild(item);
  }
}

function buildDaySummaries() {
  const groups = new Map();

  for (const event of state.events) {
    const dateKey = formatDateKey(event.timestamp);
    let summary = groups.get(dateKey);

    if (!summary) {
      summary = createEmptySummary(dateKey);
      groups.set(dateKey, summary);
    }

    summary.events.push(event);
    summary.totalCount += 1;
    summary.counts[event.type] += 1;

    if (!summary.lastByType[event.type]) {
      summary.lastByType[event.type] = event;
    }

    if (!summary.lastEvent) {
      summary.lastEvent = event;
    }
  }

  const summaries = Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  for (const summary of summaries) {
    summary.peeGapMs = getPeeGap(summary.events);
  }

  return summaries;
}

function buildRecentWindow(daySummaries, numberOfDays) {
  const summariesByDate = new Map(daySummaries.map((summary) => [summary.dateKey, summary]));
  const result = [];

  for (let index = numberOfDays - 1; index >= 0; index -= 1) {
    const date = createRelativeDate(-index);
    const dateKey = formatDateKey(date.getTime());
    result.push(summariesByDate.get(dateKey) || createEmptySummary(dateKey));
  }

  return result;
}

function createEmptySummary(dateKey) {
  return {
    dateKey,
    events: [],
    totalCount: 0,
    counts: {
      water: 0,
      pee: 0,
      number2: 0,
    },
    lastByType: {
      water: null,
      pee: null,
      number2: null,
    },
    lastEvent: null,
    peeGapMs: null,
  };
}

function getSummaryForDate(daySummaries, dateKey) {
  return daySummaries.find((summary) => summary.dateKey === dateKey) || createEmptySummary(dateKey);
}

function getSelectedDayEvents() {
  return state.events.filter((event) => formatDateKey(event.timestamp) === state.selectedDate);
}

function normalizeImportedEvents(payload) {
  const events = Array.isArray(payload) ? payload : payload && Array.isArray(payload.events) ? payload.events : [];

  return events
    .filter(isValidEvent)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      timestamp: entry.timestamp,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function isValidEvent(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    (entry.type === "water" || entry.type === "pee" || entry.type === "number2") &&
    typeof entry.timestamp === "number" &&
    Number.isFinite(entry.timestamp)
  );
}

function getPeeGap(events) {
  const peeEvents = events.filter((event) => event.type === "pee");

  if (peeEvents.length < 2) {
    return null;
  }

  return Math.max(0, peeEvents[0].timestamp - peeEvents[1].timestamp);
}

function formatLastEvent(event, fallback) {
  if (!event) {
    return fallback;
  }

  return `Last at ${formatClockTime(event.timestamp)}`;
}

function segmentPercent(count, total) {
  if (count === 0 || total === 0) {
    return "0%";
  }

  return `${(count / total) * 100}%`;
}

function formatChipDate(dateKey) {
  if (dateKey === formatDateKey(Date.now())) {
    return "Today";
  }

  if (dateKey === formatDateKey(createRelativeDate(-1).getTime())) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(createLocalDate(dateKey, 12));
}

function formatArchiveTitle(dateKey) {
  if (dateKey === formatDateKey(Date.now())) {
    return "Today";
  }

  if (dateKey === formatDateKey(createRelativeDate(-1).getTime())) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(createLocalDate(dateKey, 12));
}

function formatLongDate(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(createLocalDate(dateKey, 12));
}

function formatShortDay(dateKey) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(createLocalDate(dateKey, 12));
}

function formatClockTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatCompactDuration(milliseconds) {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function formatCountLabel(count, noun) {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function formatDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createLocalDate(dateKey, hour = 0) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function createRelativeDate(dayOffset) {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, 12, 0, 0, 0);
}

function labelForHistory(type) {
  if (type === "water") {
    return "💧 Water";
  }

  if (type === "pee") {
    return "🚽 Pee";
  }

  return "💩 #2";
}

function labelForToast(type) {
  if (type === "water") {
    return "Water";
  }

  if (type === "pee") {
    return "Pee";
  }

  return "#2";
}

function setBackupStatus(message) {
  elements.backupStatus.textContent = message;
}

function leadingClassForType(type) {
  if (type === "water") {
    return "is-water";
  }

  if (type === "pee") {
    return "is-pee";
  }

  return "is-number-two";
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

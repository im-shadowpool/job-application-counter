import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CalendarMonthOutlined,
  CheckRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  CloseRounded,
  DarkModeOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  LightModeOutlined,
  NotesOutlined,
  SendRounded,
  ViewWeekOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  ButtonBase,
  CssBaseline,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { CONFETTI_MILESTONES, fireConfetti } from "./confetti";

const DATA_KEY ="job-counter-data";
const NOTES_KEY = "job-counter-notes";
const THEME_KEY = "job-counter-theme";

type ColorMode = "light" | "dark";
type CalendarView = "week" | "month";
type DailyCounts = Record<string, number>;
type Note = { id: string; text: string; createdAt: string; updatedAt?: string };

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current interaction usable if browser storage is unavailable.
  }
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function recentDateKeys(today: string) {
  const anchor = dateFromKey(today);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - 6 + index);
    return dateKey(day);
  });
}

function loadCounts(): DailyCounts {
  const stored = readJson<unknown>(DATA_KEY, {});
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

  return Object.fromEntries(
    Object.entries(stored).flatMap(([key, value]) => {
      const count = Number(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(count)
        ? [[key, Math.max(0, Math.floor(count))]]
        : [];
    }),
  );
}

function newNoteId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<Note>;
  return typeof note.id === "string" && typeof note.text === "string" && typeof note.createdAt === "string";
}

function loadNotes(): Note[] {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(NOTES_KEY);
  } catch {
    return [];
  }
  if (stored === null || stored.length === 0) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "version" in parsed &&
      parsed.version === 2 &&
      "items" in parsed &&
      Array.isArray(parsed.items) &&
      parsed.items.every(isNote)
    ) {
      return parsed.items;
    }
  } catch {
    // The previous version saved the note as plain text rather than JSON.
  }

  return [{ id: "legacy-" + newNoteId(), text: stored, createdAt: new Date().toISOString() }];
}

function getSavedMode(): ColorMode {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function getDateTabText(key: string, today: string) {
  const date = dateFromKey(key);
  return {
    weekday:
      key === today
        ? "TODAY"
        : new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat("en", { day: "numeric" }).format(date),
  };
}

function getDateLabel(key: string, today: string) {
  if (key === today) return "TODAY";
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(dateFromKey(key))
    .toUpperCase();
}

function monthGrid(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(dateKey(new Date(month.getFullYear(), month.getMonth(), day, 12)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatNoteTime(note: Note) {
  const timestamp = note.updatedAt || note.createdAt;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function LinkifiedText({ text }: { text: string }) {
  const matcher = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const pieces: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const rawUrl = match[0];
    const url = rawUrl.replace(/[.,!?;:]+$/, "");
    if (!url) continue;
    pieces.push(text.slice(cursor, match.index));
    pieces.push(
      <a
        key={match.index}
        className="message-link"
        href={url.toLowerCase().startsWith("www.") ? "https://" + url : url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {url}
      </a>,
    );
    pieces.push(rawUrl.slice(url.length));
    cursor = match.index + rawUrl.length;
  }
  pieces.push(text.slice(cursor));
  return <>{pieces}</>;
}

function App() {
  const [mode, setMode] = useState<ColorMode>(getSavedMode);
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [counts, setCounts] = useState<DailyCounts>(loadCounts);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [counterMotion, setCounterMotion] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const noteComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedTabRef = useRef<HTMLButtonElement | null>(null);
  const counterRef = useRef<HTMLButtonElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const dates = useMemo(() => recentDateKeys(today), [today]);
  const monthDates = useMemo(() => monthGrid(calendarMonth), [calendarMonth]);
  const count = counts[selectedDate] ?? 0;
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const currentMonthIndex = new Date(dateFromKey(today).getFullYear(), dateFromKey(today).getMonth(), 1).getTime();
  const nextMonthIndex = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1).getTime();
  const canGoToNextMonth = nextMonthIndex <= currentMonthIndex;

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === "light" ? "#426d53" : "#8fc69e",
            contrastText: mode === "light" ? "#ffffff" : "#102016",
          },
          background: {
            default: mode === "light" ? "#f5f7f4" : "#111713",
            paper: mode === "light" ? "#ffffff" : "#19211c",
          },
          text: {
            primary: mode === "light" ? "#18221b" : "#eef3ef",
            secondary: mode === "light" ? "#738077" : "#9ca9a0",
          },
          divider: mode === "light" ? "#e2e8e2" : "#2a352e",
        },
        shape: { borderRadius: 16 },
        typography: {
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          button: { textTransform: "none", fontWeight: 600 },
        },
      }),
    [mode],
  );

  useEffect(() => {
    writeJson(DATA_KEY, counts);
  }, [counts]);

  useEffect(() => {
    writeJson(NOTES_KEY, { version: 2, items: notes });
  }, [notes]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextToday = dateKey(new Date());
      if (nextToday !== today) {
        if (selectedDate === today) setSelectedDate(nextToday);
        setToday(nextToday);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [today, selectedDate]);

  useEffect(() => {
    if (calendarView === "week") {
      selectedTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [calendarView, selectedDate, today]);

  useEffect(() => {
    if (!notesOpen) return;
    if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    const focusFrame = window.requestAnimationFrame(() => noteComposerRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [notesOpen, notes.length]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        event.altKey || event.ctrlKey || event.metaKey || target.isContentEditable ||
        target.closest("input, textarea, select, [contenteditable='true']")
      ) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (notesOpen) noteComposerRef.current?.focus();
        else setNotesOpen(true);
        return;
      }
      if (notesOpen) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = dateFromKey(selectedDate);
        next.setDate(next.getDate() + (event.key === "ArrowLeft" ? -1 : 1));
        const nextKey = dateKey(next);
        if (nextKey > today || (calendarView === "week" && !dates.includes(nextKey))) return;
        if (calendarView === "month" && nextKey.slice(0, 7) !== dateKey(calendarMonth).slice(0, 7)) {
          setCalendarMonth(startOfMonth(next));
        }
        selectDate(nextKey);
        return;
      }

      if (event.code === "Space" && !event.repeat && !target.closest("button, a, [role='button']")) {
        event.preventDefault();
        changeCount(1);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [calendarMonth, calendarView, dates, notesOpen, selectedDate, today]);

  function changeCount(change: 1 | -1) {
    const previousCount = counts[selectedDate] ?? 0;
    const nextCount = Math.max(0, previousCount + change);
    if (nextCount === previousCount) return;

    setCounts((current) => ({ ...current, [selectedDate]: nextCount }));
    setCounterMotion((value) => value + 1);

    if (change === 1 && CONFETTI_MILESTONES.includes(nextCount)) {
      const rect = counterRef.current?.getBoundingClientRect();
      fireConfetti(
        nextCount,
        rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      );
    }
  }

  function selectDate(key: string) {
    setSelectedDate(key);
    setCounterMotion((value) => value + 1);
  }

  function exportData() {
    const payload = { app: "job-counter", version: 1, exportedAt: new Date().toISOString(), counts, notes };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "job-counter-" + dateKey(new Date()) + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!data || typeof data !== "object") throw new Error("invalid");
      const { counts: rawCounts, notes: rawNotes } = data as { counts?: unknown; notes?: unknown };
      if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) throw new Error("invalid");
      const nextCounts: DailyCounts = {};
      for (const [key, value] of Object.entries(rawCounts)) {
        const n = Number(value);
        if (/^d{4}-d{2}-d{2}$/.test(key) && Number.isFinite(n)) nextCounts[key] = Math.max(0, Math.floor(n));
      }
      const nextNotes = Array.isArray(rawNotes) ? rawNotes.filter(isNote) : [];
      if (!window.confirm("Importing replaces your current counts and notes. Continue?")) return;
      setCounts(nextCounts);
      setNotes(nextNotes);
      setCounterMotion((value) => value + 1);
    } catch {
      window.alert("That file isn't a valid Job counter export.");
    }
  }

  function changeMode() {
    const nextMode = mode === "light" ? "dark" : "light";
    setMode(nextMode);
    try {
      window.localStorage.setItem(THEME_KEY, nextMode);
    } catch {
      // Theme remains active for this visit even if storage is unavailable.
    }
  }

  function showWeekView() {
    setCalendarView("week");
    setSelectedDate(today);
    setCounterMotion((value) => value + 1);
  }

  function showMonthView() {
    setCalendarMonth(startOfMonth(dateFromKey(selectedDate)));
    setCalendarView("month");
  }

  function toggleCalendarView() {
    if (calendarView === "week") showMonthView();
    else showWeekView();
  }

  function changeMonth(amount: -1 | 1) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  }

  function submitNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setNotes((current) => [...current, { id: newNoteId(), text, createdAt: new Date().toISOString() }]);
    setNoteDraft("");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitNote();
    }
  }

  function beginEdit(note: Note) {
    setEditingNoteId(note.id);
    setEditDraft(note.text);
  }

  function cancelEdit() {
    setEditingNoteId(null);
    setEditDraft("");
  }

  function saveEdit(noteId: string) {
    const text = editDraft.trim();
    if (!text) return;
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId ? { ...note, text, updatedAt: new Date().toISOString() } : note,
      ),
    );
    cancelEdit();
  }

  function deleteNote(noteId: string) {
    setNotes((current) => current.filter((note) => note.id !== noteId));
    if (editingNoteId === noteId) cancelEdit();
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="app-shell" data-mode={mode} data-calendar={calendarView}>
        <Stack component="nav" className="fixed-controls" aria-label="App controls">
          <Tooltip
            title={calendarView === "week" ? "Open month calendar" : "Return to 7-day view"}
            placement="right"
          >
            <IconButton
              aria-label={calendarView === "week" ? "Open month calendar" : "Return to 7-day view"}
              aria-pressed={calendarView === "month"}
              onClick={toggleCalendarView}
              className="quiet-icon"
            >
              {calendarView === "week" ? (
                <CalendarMonthOutlined fontSize="small" />
              ) : (
                <ViewWeekOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Notes" placement="right">
            <IconButton aria-label="Open notes" onClick={() => setNotesOpen(true)} className="quiet-icon">
              <NotesOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export data" placement="right">
            <IconButton aria-label="Export data" onClick={exportData} className="quiet-icon">
              <FileDownloadOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import data" placement="right">
            <IconButton aria-label="Import data" onClick={() => importInputRef.current?.click()} className="quiet-icon">
              <FileUploadOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importData(file);
            }}
          />
          <Tooltip title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"} placement="right">
            <IconButton
              aria-label={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
              onClick={changeMode}
              className="quiet-icon"
            >
              <span className="theme-glyph" key={mode}>
                {mode === "light" ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
              </span>
            </IconButton>
          </Tooltip>
        </Stack>

        <Box component="section" className="calendar-area" aria-label="Application calendar">
          {calendarView === "month" && (
            <Box className="calendar-toolbar">
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }} className="month-navigation">
                  <Tooltip title="Previous month">
                    <IconButton aria-label="Previous month" onClick={() => changeMonth(-1)} className="calendar-arrow">
                      <ChevronLeftRounded />
                    </IconButton>
                  </Tooltip>
                  <Typography className="calendar-period month-period">{monthTitle}</Typography>
                  <Tooltip title="Next month">
                    <span>
                      <IconButton
                        aria-label="Next month"
                        onClick={() => changeMonth(1)}
                        disabled={!canGoToNextMonth}
                        className="calendar-arrow"
                      >
                        <ChevronRightRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
            </Box>
          )}

          {calendarView === "week" ? (
            <Box className="date-strip" role="group" aria-label="Choose a day">
              {dates.map((key) => {
                const label = getDateTabText(key, today);
                const active = key === selectedDate;
                return (
                  <ButtonBase
                    key={key}
                    ref={active ? selectedTabRef : null}
                    aria-pressed={active}
                    aria-label={
                      new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(dateFromKey(key)) +
                      ", " +
                      (counts[key] ?? 0) +
                      " applications"
                    }
                    onClick={() => selectDate(key)}
                    className={"date-tab" + (active ? " is-selected" : "")}
                  >
                    <span className="date-weekday">{label.weekday}</span>
                    <span className="date-number">{label.day}</span>
                    <span className="date-count">{counts[key] ?? 0}</span>
                  </ButtonBase>
                );
              })}
            </Box>
          ) : (
            <>
              <Box className="weekday-strip" aria-hidden="true">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </Box>
              <Box className="month-grid" role="group" aria-label={monthTitle}>
                {monthDates.map((key, index) => {
                  if (!key) return <span key={"empty-" + index} className="month-empty" aria-hidden="true" />;
                  const date = dateFromKey(key);
                  const dayNumber = date.getDate();
                  const active = key === selectedDate;
                  const isToday = key === today;
                  const isFuture = key > today;
                  const dayCount = counts[key] ?? 0;
                  return (
                    <ButtonBase
                      key={key}
                      disabled={isFuture}
                      aria-pressed={active}
                      aria-label={
                        new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(date) +
                        ", " +
                        dayCount +
                        " applications"
                      }
                      onClick={() => selectDate(key)}
                      className={
                        "month-day" +
                        (active ? " is-selected" : "") +
                        (isToday ? " is-today" : "")
                      }
                    >
                      <span className="month-day-number">{dayNumber}</span>
                      {dayCount > 0 && <span className="month-day-count">{dayCount}</span>}
                    </ButtonBase>
                  );
                })}
              </Box>
            </>
          )}
        </Box>

        <Box component="main" className="counter-stage">
          <Box className="counter-center">
            <ButtonBase
              ref={counterRef}
              className="counter-target"
              onClick={() => changeCount(1)}
              onContextMenu={(event) => {
                event.preventDefault();
                changeCount(-1);
              }}
              aria-label={"Add one application for " + getDateLabel(selectedDate, today).toLowerCase() + ". Current count " + count}
            >
              <span className="counter-kicker">APPLICATIONS</span>
              <Typography component="span" className="counter-value" key={counterMotion} aria-live="polite" aria-atomic="true">
                {count}
              </Typography>
              <span className="counter-date">{getDateLabel(selectedDate, today)}</span>
              <span className="counter-ring" aria-hidden="true" />
            </ButtonBase>
          </Box>
        </Box>

        <Drawer
          anchor="right"
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          transitionDuration={260}
          slotProps={{ paper: { className: "notes-drawer-paper " + (mode === "dark" ? "is-dark" : "is-light") } }}
        >
          <Box className="notes-content">
            <Box className="notes-heading">
              <Box>
                <Typography component="h2" className="notes-title">Notes</Typography>
              </Box>
              <IconButton aria-label="Close notes" onClick={() => setNotesOpen(false)} className="quiet-icon">
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>

            <Box className="message-list" ref={messageListRef} aria-label="Your notes">
              {notes.length === 0 ? (
                <Typography className="notes-empty">
                  Your notes will appear here. Add a reminder or follow-up below.
                </Typography>
              ) : (
                notes.map((note) => (
                  <Box component="article" className="message-row" key={note.id}>
                    <Box className="message-bubble">
                      {editingNoteId === note.id ? (
                        <>
                          <TextField
                            multiline
                            minRows={2}
                            maxRows={8}
                            fullWidth
                            autoFocus
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            slotProps={{ htmlInput: { "aria-label": "Edit note" } }}
                            className="message-edit-field"
                          />
                          <Box className="message-edit-actions">
                            <Button size="small" onClick={cancelEdit} startIcon={<CloseRounded fontSize="small" />}>
                              Cancel
                            </Button>
                            <Button
                              size="small"
                              onClick={() => saveEdit(note.id)}
                              disabled={!editDraft.trim()}
                              startIcon={<CheckRounded fontSize="small" />}
                            >
                              Save
                            </Button>
                          </Box>
                        </>
                      ) : (
                        <Typography className="message-text">
                          <LinkifiedText text={note.text} />
                        </Typography>
                      )}
                      <Box className="message-meta">
                        <Typography component="time" dateTime={note.updatedAt || note.createdAt}>
                          {formatNoteTime(note)}{note.updatedAt ? " · edited" : ""}
                        </Typography>
                        {editingNoteId !== note.id && (
                          <Stack direction="row" spacing={0.25} className="message-actions">
                            <Tooltip title="Edit note">
                              <IconButton
                                aria-label="Edit note"
                                onClick={() => beginEdit(note)}
                                className="message-action"
                              >
                                <EditOutlined fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete note">
                              <IconButton
                                aria-label="Delete note"
                                onClick={() => deleteNote(note.id)}
                                className="message-action"
                              >
                                <DeleteOutlineOutlined fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))
              )}
            </Box>

            <Box component="form" className="note-composer" onSubmit={(event) => { event.preventDefault(); submitNote(); }}>
              <TextField
                multiline
                minRows={1}
                maxRows={5}
                fullWidth
                inputRef={noteComposerRef}
                placeholder="Write a note…"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                slotProps={{ htmlInput: { "aria-label": "Write a note" } }}
                className="composer-field"
              />
              <Tooltip title="Send note">
                <span>
                  <IconButton type="submit" aria-label="Send note" disabled={!noteDraft.trim()} className="send-note">
                    <SendRounded fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Drawer>
      </Box>
    </ThemeProvider>
  );
}

export default App;

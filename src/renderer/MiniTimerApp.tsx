import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Pause, Play, Square, ChevronDown, Briefcase, StickyNote, Video, Search, X } from 'lucide-react';
import { IPC, TodayPlan, PinnedTodo, AppSettings } from '../shared/types';

interface TimerState {
  elapsed: number;
  isRunning: boolean;
  isPaused: boolean;
  taskLabel: string;
  basecampTodoId?: number;
}

const COMPACT_W = 240;
const COMPACT_H = 36; // v5.3.1 — reverted from 44; project name moved to expanded panel
const EXPANDED_W = 300;
// Height calculated dynamically: header (52) + items (each 50) + padding (12).

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Notes section is fixed height — we use this in the dynamic resize calc below.
const NOTES_SECTION_H = 110;

export default function MiniTimerApp() {
  const [timer, setTimer] = useState<TimerState>({ elapsed: 0, isRunning: false, isPaused: false, taskLabel: '' });
  const [expanded, setExpanded] = useState(false);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [autoDim, setAutoDim] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [taskSearchText, setTaskSearchText] = useState('');
  // Meeting mode — suppresses idle pause for the active session. Toggled
  // from the Notes header in this panel; main process owns the source of
  // truth and broadcasts changes (so the in-meeting "I'm in a meeting" path
  // from the idle prompt also reflects here).
  const [meetingMode, setMeetingMode] = useState(false);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Subscribe to timer state ─────────────────────────────────
  useEffect(() => {
    const offTimer = window.zenstate.on(IPC.TIMER_UPDATE, (data: unknown) => {
      const t = data as TimerState;
      setTimer(t);
    });
    // Listen for Meeting mode changes from main — main is the source of
    // truth (so the idle prompt's "I'm in a meeting" button reflects here).
    const offMeeting = window.zenstate.on(IPC.TIMER_MEETING_MODE_CHANGED, (...args: unknown[]) => {
      setMeetingMode(!!args[0]);
    });
    return () => { offTimer(); offMeeting(); };
  }, []);

  // ── Load plan + settings; subscribe to changes. Subscribe before fetching
  // so a today:changed event arriving during the fetch can't be clobbered
  // by the late initial response.
  useEffect(() => {
    let planEventArrived = false;
    const offToday = window.zenstate.on(IPC.TODAY_CHANGED, (...args: unknown[]) => {
      planEventArrived = true;
      setPlan(args[0] as TodayPlan);
    });
    const offSettings = window.zenstate.on('settings:updated', (...args: unknown[]) => {
      setAutoDim(!!(args[0] as AppSettings)?.miniTimerAutoDim);
    });

    window.zenstate.todayGet().then((res) => {
      if (!planEventArrived && res) setPlan(res.plan);
    }).catch(() => {});
    window.zenstate.getSettings().then((s) => {
      setAutoDim(!!s?.miniTimerAutoDim);
    }).catch(() => {});

    return () => { offToday(); offSettings(); };
  }, []);

  // ── Auto-dim: fade pill to 50% after 4s of no hover, snap back on enter ──
  const scheduleDim = useCallback(() => {
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    if (!autoDim || expanded) {
      setDimmed(false);
      return;
    }
    dimTimerRef.current = setTimeout(() => setDimmed(true), 4000);
  }, [autoDim, expanded]);

  useEffect(() => { scheduleDim(); }, [scheduleDim, timer.elapsed]);
  useEffect(() => {
    return () => { if (dimTimerRef.current) clearTimeout(dimTimerRef.current); };
  }, []);

  // ── Notes: in-progress capture from the pill ─────────────────
  // The user's typed notes live in main-process memory for the duration of
  // the session — they get reset when a new timer starts (taskLabel change),
  // and at stop they pre-fill the timesheet confirm popup. We sync from main
  // when the panel expands so a user who types in the dashboard or popover
  // (future) sees the same value here. A short debounce avoids spamming IPC
  // on every keystroke.
  useEffect(() => {
    // Reset local notes whenever the active task changes (new session started
    // from elsewhere) so we never carry stale text from the prior task.
    setNotes('');
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }
  }, [timer.taskLabel]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (window as any).zenstate.miniTimerGetNotes?.().then((n: string) => {
      if (cancelled) return;
      // Only adopt main's value if the user hasn't started typing here yet.
      // Otherwise we'd clobber what they were writing.
      setNotes((prev) => (prev ? prev : (n ?? '')));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [expanded]);

  const onNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      window.zenstate.miniTimerSetNotes(value);
    }, 350);
  }, []);

  // Flush any pending debounced save synchronously. Used at Stop time so the
  // last few keystrokes don't get dropped when the user hits Stop within the
  // 350ms debounce window.
  const flushNotes = useCallback(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
      window.zenstate.miniTimerSetNotes(notes);
    }
  }, [notes]);

  // Stop the timer, but flush pending notes first so they survive into the
  // saved session + the timesheet confirm popup.
  const handleStop = useCallback(() => {
    flushNotes();
    window.zenstate.stopTimer();
  }, [flushNotes]);

  // Flush any pending debounced save on unmount (e.g. window closed, timer stopped).
  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
        // Best-effort flush — if the renderer is being torn down anyway,
        // this may not arrive, but the typical case (collapse, not unmount)
        // will already have flushed via the timeout firing.
      }
    };
  }, []);

  // ── Expand/collapse the window ───────────────────────────────
  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      // Compute dynamic height based on switchable items (excludes running task
      // and completed items — matches what's actually rendered in the switcher).
      const switchableCount = (plan?.items ?? []).filter(
        (p) => p.content !== timer.taskLabel && !p.completedAt
      ).length;
      // v5.3.1 — Project banner is ~24px when shown, 0 when no match. Match
      // by todoId first (more reliable), fall back to content.
      const hasProjectBanner = (plan?.items ?? []).some((p) =>
        timer.basecampTodoId != null ? p.todoId === timer.basecampTodoId : p.content === timer.taskLabel
      );
      const projectBannerH = hasProjectBanner ? 24 : 0;
      // v5.7.0 — Folder headers add ~22px each when more than one group is
      // visible. Count distinct folder IDs among switchable items.
      const switchableItems = (plan?.items ?? []).filter(
        (p) => p.content !== timer.taskLabel && !p.completedAt
      );
      const folderIds = new Set<string>();
      for (const it of switchableItems) {
        const uf = it.folderId ? (plan?.userFolders ?? []).find((f) => f.id === it.folderId) : undefined;
        folderIds.add(uf ? uf.id : `project-${it.projectId}`);
      }
      const folderHeadersH = folderIds.size > 1 ? folderIds.size * 22 : 0;
      // Item rows + "Today" heading (~24px) + bottom button (~32px).
      // Search bar (~34px) is only rendered when switchableCount > 0.
      const switcherHeight = switchableCount > 0
        ? 24 + 50 * switchableCount + folderHeadersH + 16 + 34 + 32
        : 56 + 32;
      const height = Math.min(540, COMPACT_H + projectBannerH + NOTES_SECTION_H + switcherHeight);
      window.zenstate.miniTimerResize({ width: EXPANDED_W, height });
    } else {
      setTaskSearchText('');
      window.zenstate.miniTimerResize({ width: COMPACT_W, height: COMPACT_H });
    }
  }, [expanded, plan, timer.taskLabel, setTaskSearchText]);

  // Collapse if nothing is running anymore (avoid orphaned expanded state).
  useEffect(() => {
    if (!timer.isRunning && expanded) {
      setExpanded(false);
      window.zenstate.miniTimerResize({ width: COMPACT_W, height: COMPACT_H });
    }
  }, [timer.isRunning, expanded]);

  // ── Search input ref for auto-focus on expand ─────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Drag + click on the pill body ────────────────────────────
  // We can't use macOS' -webkit-app-region: drag here because that swallows
  // mousedown at the OS level — JS click events would never fire. Instead
  // we drive movement manually: capture mouse events, send tiny (dx, dy)
  // deltas to main on each move, and treat a no-movement gesture as a click.
  const dragRef = useRef<{ lastScreenX: number; lastScreenY: number; totalDx: number; totalDy: number } | null>(null);

  const onPillMouseDown = useCallback((e: React.MouseEvent) => {
    // Buttons handle their own clicks; don't start a drag from them.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      lastScreenX: e.screenX,
      lastScreenY: e.screenY,
      totalDx: 0,
      totalDy: 0,
    };
  }, []);

  useEffect(() => {
    function onMove(ev: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.screenX - drag.lastScreenX;
      const dy = ev.screenY - drag.lastScreenY;
      if (dx === 0 && dy === 0) return;
      drag.lastScreenX = ev.screenX;
      drag.lastScreenY = ev.screenY;
      drag.totalDx += dx;
      drag.totalDy += dy;
      window.zenstate.miniTimerMoveBy({ dx, dy });
    }

    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      const wasDrag = Math.abs(drag.totalDx) > 3 || Math.abs(drag.totalDy) > 3;
      dragRef.current = null;
      if (!wasDrag) {
        // It was a click, not a drag — toggle the expanded panel.
        toggleExpanded();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [toggleExpanded]);

  // ── Handlers ──────────────────────────────────────────────────
  const switchToPinned = useCallback((p: PinnedTodo) => {
    // Stop the current timer first; the new one starts cleanly so the
    // pre-flight Basecamp confirmation can run on the outgoing session.
    // ipcRenderer.send preserves order from a single renderer, and main's
    // stopTimer flips its running flag synchronously, so back-to-back
    // calls are safe (no setTimeout dance needed).
    if (timer.isRunning) {
      flushNotes();
      window.zenstate.stopTimer();
    }
    window.zenstate.startTimer(p.content, undefined, undefined, {
      accountId: p.accountId, projectId: p.projectId, todoId: p.todoId,
      todoListId: p.todoListId, projectName: p.projectName,
    });
    setTaskSearchText('');
    setExpanded(false);
    window.zenstate.miniTimerResize({ width: COMPACT_W, height: COMPACT_H });
  }, [timer.isRunning, flushNotes, setTaskSearchText]);

  // ── Render ────────────────────────────────────────────────────
  const accent = timer.isPaused ? 'var(--status-occupied, #ff9500)' : 'var(--status-available, #34c759)';
  const label = timer.taskLabel || 'No task';
  const truncated = label.length > 18 ? label.slice(0, 18) + '…' : label;

  // Filter out the currently-running task and any completed items — the pill
  // is for the in-the-moment switch, so completed work is just noise here.
  // Memoized to avoid a new array on every 1-second timer tick.
  const switchablePinned = React.useMemo(() =>
    (plan?.items ?? []).filter((p) => p.content !== timer.taskLabel && !p.completedAt),
    [plan?.items, timer.taskLabel]
  );

  // Project name for the compact pill — match by todoId first (reliable),
  // fall back to content match. Undefined if no plan match (manual timer).
  const activeProjectName = React.useMemo(() => {
    if (!plan?.items) return undefined;
    const match = timer.basecampTodoId != null
      ? plan.items.find((p) => p.todoId === timer.basecampTodoId)
      : plan.items.find((p) => p.content === timer.taskLabel);
    return match?.projectName;
  }, [plan?.items, timer.basecampTodoId, timer.taskLabel]);

  // Auto-focus the search input when the panel expands and there are tasks.
  useEffect(() => {
    if (expanded && switchablePinned.length > 0) {
      searchInputRef.current?.focus();
    }
  }, [expanded]);

  const filteredSwitchablePinned = React.useMemo(() => {
    if (!taskSearchText.trim()) return switchablePinned;
    const q = taskSearchText.toLowerCase();
    return switchablePinned.filter((p) =>
      p.content.toLowerCase().includes(q) ||
      (p.projectName && p.projectName.toLowerCase().includes(q))
    );
  }, [switchablePinned, taskSearchText]);

  return (
    <div
      onMouseEnter={() => { setDimmed(false); if (dimTimerRef.current) clearTimeout(dimTimerRef.current); }}
      onMouseLeave={scheduleDim}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(20, 22, 26, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        color: '#e6edf3',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        fontSize: 12,
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity 280ms ease-out',
        overflow: 'hidden',
      }}
    >
      {/* Compact pill row (always visible).
          Drag-to-move + click-to-expand both work via JS mouse events.
          Mousedown on the body starts a potential drag. If the cursor moves
          more than 3px before mouseup, it's a drag (each move sends a delta
          to the main process to reposition the window). If it doesn't move,
          mouseup is treated as a click and toggles the expanded panel. */}
      <div
        onMouseDown={onPillMouseDown}
        style={{
          height: COMPACT_H,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          // v5.6.1 — Symmetric horizontal padding. Previously '0 8px 0 10px'
          // put the dot 10px from the left edge while the stop-square icon
          // (12px icon + 4px IconBtn padding + 8px pill padding = 12px from
          // the right edge) sat with less visual breathing room. The button
          // cluster on the right has heavier visual weight than the dot on
          // the left, so they need the SAME inset to read as balanced.
          padding: '0 10px',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accent, flexShrink: 0,
          boxShadow: timer.isRunning && !timer.isPaused ? `0 0 6px ${accent}` : 'none',
        }} />

        <span style={{ fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {formatHMS(timer.elapsed)}
        </span>

        {/* v5.3.1 — Reverted to single-line task label to keep the pill slim
            (36px). Project name now lives in the expanded panel above Notes
            so it's visible when needed without crowding the always-visible
            pill. */}
        <span style={{ flex: 1, minWidth: 0, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncated}
        </span>

        {/* Chevron — rotates when expanded */}
        {/* Bigger and more opaque chevron — research finding: this is the
            best interaction in the app (one-click task switch) but the old
            11px / 0.5 opacity version was easy to miss. */}
        <span
          title={expanded ? 'Hide tasks' : 'Click to switch tasks'}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <ChevronDown
            size={13}
            style={{ opacity: 0.85, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 180ms ease' }}
          />
        </span>

        {/* Pause/Resume */}
        <IconBtn
          title={timer.isPaused ? 'Resume' : 'Pause'}
          onClick={() => (timer.isPaused ? window.zenstate.resumeTimer() : window.zenstate.pauseTimer())}
        >
          {timer.isPaused ? <Play size={12} /> : <Pause size={12} />}
        </IconBtn>

        {/* Stop */}
        <IconBtn title="Stop" onClick={handleStop}>
          <Square size={12} />
        </IconBtn>
      </div>

      {/* Expanded panel — notes + task switcher */}
      {expanded && (
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* v5.3.1 — Project name banner above Notes. Gives task-name context
              without crowding the always-visible compact pill. Hidden when no
              matching pinned todo (e.g. manual non-Basecamp timer). */}
          {activeProjectName && (
            <div style={{
              padding: '6px 12px 4px',
              fontSize: 10,
              color: 'rgba(230,237,243,0.55)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', gap: 6,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <Briefcase size={10} style={{ opacity: 0.55, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeProjectName}</span>
            </div>
          )}
          {/* Notes — captured throughout the session, pre-fills the timesheet
              confirm popup at stop, and saves to the local session record.
              Debounced save means a few keystrokes don't flood IPC. */}
          <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: 'rgba(230,237,243,0.4)',
              marginBottom: 6,
            }}>
              <StickyNote size={10} /> Notes
              <div style={{ flex: 1 }} />
              {/* Meeting-mode toggle. When on, the "still working?" idle
                  prompt is suppressed for this session — useful for video
                  calls where the user isn't touching keyboard/mouse. */}
              <button
                onClick={() => window.zenstate.timerSetMeetingMode(!meetingMode)}
                title={meetingMode ? 'Meeting mode on — idle pause suppressed' : 'Turn on Meeting mode (suppress idle pause)'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px',
                  borderRadius: 10,
                  background: meetingMode ? 'rgba(10, 132, 255, 0.22)' : 'transparent',
                  border: meetingMode ? '1px solid rgba(10, 132, 255, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                  color: meetingMode ? 'var(--zen-primary, #0a84ff)' : 'rgba(230,237,243,0.55)',
                  fontFamily: 'inherit',
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                <Video size={10} />
                {meetingMode ? 'In meeting' : 'Meeting'}
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="What are you working on?"
              maxLength={500}
              rows={3}
              style={{
                width: '100%',
                resize: 'none',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: '6px 8px',
                color: '#e6edf3',
                fontFamily: 'inherit',
                fontSize: 11,
                lineHeight: 1.4,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
            />
          </div>

          {/* v5.8.1 — "+ Pin another to-do" promoted to the top of the
              switchable area (below the search box when one's shown,
              above the empty-state copy when nothing's pinned). Long
              pinned lists previously made it a scroll-down chore to
              add a new task. Same change as the Plan tab. */}
          <button
            onClick={() => window.zenstate.openDashboardAndPin()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6,
              width: 'calc(100% - 24px)',
              margin: '6px 12px 4px',
              padding: '6px 12px',
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: 'rgba(230,237,243,0.65)',
              fontFamily: 'inherit',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'color 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(230,237,243,0.65)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          >
            + Pin another to-do
          </button>

          {switchablePinned.length === 0 ? (
            <div style={{ padding: '14px 12px', fontSize: 11, color: 'rgba(230,237,243,0.55)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Briefcase size={11} /> Nothing else pinned. Plan a few in Today.
            </div>
          ) : (
            <>
              {/* Search Box */}
              <div style={{ padding: '4px 12px 6px', position: 'relative' }}>
                <Search size={10} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                <input
                  ref={searchInputRef}
                  aria-label="Search pinned tasks"
                  placeholder="Search pinned tasks..."
                  value={taskSearchText}
                  onChange={(e) => setTaskSearchText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px 5px 22px',
                    fontSize: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    color: '#e6edf3',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                />
                {taskSearchText && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setTaskSearchText('')}
                    style={{
                      position: 'absolute',
                      right: 20,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>

              <SectionHeading>Today</SectionHeading>
              {filteredSwitchablePinned.length === 0 ? (
                <div style={{ padding: '14px 12px', fontSize: 10, color: 'rgba(230,237,243,0.45)', textAlign: 'center' }}>
                  No tasks match "{taskSearchText}"
                </div>
              ) : (() => {
                // v5.7.0 — Group switchable items by folder (user folder or
                // project auto-folder). Header is hidden when there's only one
                // group. When grouped, hide per-row project subtitle to avoid
                // visual duplication.
                const groups = new Map<string, { id: string; name: string; items: typeof filteredSwitchablePinned }>();
                for (const it of filteredSwitchablePinned) {
                  const uf = it.folderId ? (plan?.userFolders ?? []).find((f) => f.id === it.folderId) : undefined;
                  const fid = uf ? uf.id : `project-${it.projectId}`;
                  const name = uf?.name ?? it.projectName ?? 'Untitled project';
                  if (!groups.has(fid)) groups.set(fid, { id: fid, name, items: [] });
                  groups.get(fid)!.items.push(it);
                }
                const seen = new Set<string>();
                const ordered: { id: string; name: string; items: typeof filteredSwitchablePinned }[] = [];
                for (const fid of plan?.folderOrder ?? []) {
                  const g = groups.get(fid);
                  if (g && !seen.has(fid)) { ordered.push(g); seen.add(fid); }
                }
                for (const uf of plan?.userFolders ?? []) {
                  if (!seen.has(uf.id)) {
                    const g = groups.get(uf.id);
                    if (g) { ordered.push(g); seen.add(uf.id); }
                  }
                }
                ordered.push(...[...groups.values()].filter((g) => !seen.has(g.id)).sort((a, b) => a.name.localeCompare(b.name)));
                const showHeaders = ordered.length > 1;
                return ordered.flatMap((group) => [
                  showHeaders && (
                    <div key={`h-${group.id}`} style={{
                      padding: '8px 12px 2px',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: 'rgba(230,237,243,0.4)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{group.name}</div>
                  ),
                  ...group.items.map((p) => (
                    <SwitchRow
                      key={`p-${p.todoId}`}
                      title={p.content}
                      subtitle={showHeaders ? undefined : p.projectName}
                      onClick={() => switchToPinned(p)}
                    />
                  )),
                ]);
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        background: 'transparent', border: 'none', color: '#e6edf3',
        opacity: 0.78, cursor: 'pointer', padding: 4,
        display: 'flex', alignItems: 'center', borderRadius: 4,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.78'; e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 12px 4px',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: 'rgba(230,237,243,0.4)',
    }}>
      {children}
    </div>
  );
}

// Row in the expanded pill: title + Switch button on the right. The whole
// row is NOT clickable on purpose — when the user is typing a long mid-session
// note in the textarea, an accidental click on a row title would otherwise
// flush+switch tasks unintentionally. Confining the action to a small button
// keeps the switch deliberate.
function SwitchRow({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      padding: '8px 12px',
      color: '#e6edf3',
      fontFamily: 'inherit',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 10, color: 'rgba(230,237,243,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      <button
        onClick={onClick}
        title={`Switch timer to "${title}"`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '4px 9px',
          background: 'rgba(48, 209, 88, 0.18)',
          border: '1px solid rgba(48, 209, 88, 0.32)',
          borderRadius: 6,
          color: 'var(--status-available, #34c759)',
          fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(48, 209, 88, 0.28)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(48, 209, 88, 0.18)'; }}
      >
        <Play size={9} /> Switch
      </button>
    </div>
  );
}

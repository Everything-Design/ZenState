// Shared types between main process and renderer — mirrors Swift models

export enum AvailabilityStatus {
  Available = 'available',
  Occupied = 'occupied',
  Focused = 'focused',
  Offline = 'offline',
}

export interface User {
  id: string; // UUID
  name: string;
  username: string;
  status: AvailabilityStatus;
  lastSeen: string; // ISO date
  activeStatusMessage?: string;
  statusMessageExpiry?: string; // ISO date
  customMeetingMessage?: string;
  totalFocusTime: number;
  focusSessionCount: number;
  avatarEmoji?: string;
  avatarColor?: string;
  avatarImageData?: string; // base64
  isAdmin: boolean;
  canSendEmergency: boolean;
  currentFocusSession?: FocusSession;
}

export interface FocusSession {
  id: string;
  taskLabel: string;
  startTime: string; // ISO date
  endTime?: string;
  duration: number;
  category?: string;
}

export enum MessageType {
  StatusUpdate = 'statusUpdate',
  MeetingRequest = 'meetingRequest',
  MeetingRequestCancel = 'meetingRequestCancel',
  MeetingRequestAccepted = 'meetingRequestAccepted',
  MeetingRequestDeclined = 'meetingRequestDeclined',
  Heartbeat = 'heartbeat',
  UserInfo = 'userInfo',
  EmergencyMeetingRequest = 'emergencyMeetingRequest',
  EmergencyAccessGrant = 'emergencyAccessGrant',
  QuickPing = 'quickPing', // lightweight team-wide notification (anyone can send)
}

// A reusable list of peers a user can ping with one tap. Stored per-machine.
export interface PeerGroup {
  id: string;          // uuid
  name: string;        // "Design Team", "Standup", etc.
  memberIds: string[]; // ZenState peer userIds
}

// A ping the user has received (kept in memory + persisted briefly so users
// who missed the toast can still see "what happened in the last hour").
export interface ReceivedPing {
  id: string;          // uuid generated on receive
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;   // ISO
}

export interface PeerMessage {
  type: MessageType;
  senderId: string; // UUID
  senderName: string;
  payload?: string; // Base64-encoded JSON User data (for wire compat with Swift)
  timestamp: string; // ISO date
  requestMessage?: string;
}

export interface DailySession {
  id: string;
  taskLabel: string;
  startTime: string;
  endTime?: string;
  duration: number;
  category?: string;
  notes?: string;
  basecamp?: {
    accountId: number;
    projectId: number;
    todoId: number;
    todoListId?: number;
    synced?: boolean; // true once pushed to Basecamp's timesheet
    // Persistent Basecamp Timesheet::Entry id, set after a successful create.
    // Required for update/delete propagation. Sessions created before v5.1.0
    // don't have this — UI falls back to "fix in Basecamp manually" links.
    entryId?: number;
  };
}

export interface DailyRecord {
  id: string;
  date: string;
  totalFocusTime: number;
  sessions: DailySession[];
}

export interface FocusSchedule {
  id: string;
  name: string;
  enabled: boolean;
  autoStartFocus: boolean;
  startTime: { hour: number; minute: number };
  endTime: { hour: number; minute: number };
  daysOfWeek: number[]; // 0=Sun, 6=Sat
  taskLabel?: string;
}

export interface AppSettings {
  breakReminderEnabled: boolean;
  breakReminderIntervalSeconds: number;
  idleDetectionEnabled: boolean;
  idleThresholdSeconds: number;
  // When true, a Basecamp timesheet entry isn't posted automatically when a
  // timer stops — the user reviews the duration first in a confirmation alert.
  requireTimesheetConfirmation: boolean;
  // When true, a small floating pill window appears on top of all other apps
  // (including full-screen apps) while a timer is running.
  miniTimerEnabled: boolean;
  miniTimerX?: number;
  miniTimerY?: number;
  // When true, the floating pill fades to ~50% opacity after a few seconds
  // of no hover, so it stays out of the way without going invisible.
  miniTimerAutoDim: boolean;
  // v5.1.4 — App version of the last "What's new" dialog the user saw. On
  // launch the dashboard compares this with the current app.getVersion();
  // if different (or missing), the modal pops once with that version's
  // bullets, then writes the current version here.
  lastSeenWhatsNewVersion?: string;
  // v5.2 — Per-feature opt-outs. Default behaviour for both is ON; user can
  // disable in Settings if they don't want the daily prompts / notification
  // polling.
  checkInPromptEnabled?: boolean;  // 9am auto-draft for Basecamp check-ins
  notificationsEnabled?: boolean;  // poll /my/readings.json for the Hey panel
  // v5.2 — Last date (YYYY-MM-DD) the user dismissed the check-in prompt for.
  // We use this to avoid re-firing the prompt the same day after the user
  // already answered or explicitly skipped.
  lastCheckInDate?: string;
}

// ── Basecamp Types ─────────────────────────────────────────────

export interface BasecampCredentials {
  clientId: string;
  clientSecret: string;
}

export interface BasecampAccount {
  id: number;
  name: string;
  href: string; // e.g. "https://3.basecampapp.com/1234567"
  product: string; // "bc3"
}

export interface BasecampAuthState {
  isConnected: boolean;
  account?: { id: number; name: string };
  identity?: { id: number; firstName: string; lastName: string; emailAddress: string };
  expiresAt?: string;
  error?: string;
}

export interface BasecampProject {
  id: number;
  name: string;
  description?: string;
  // v5.3.1 — A project can have MULTIPLE todoset-style dock entries when the
  // user enables extra "tools" (clones of the default Todos tool). Each shows
  // up in Basecamp as a separate column with its own title (e.g. "To-dos" +
  // "Website To-Do"). All are exposed in the project's dock as dock entries
  // with `name === 'todoset'`. Previously we only kept the first one's id,
  // hiding any extras from the picker.
  todoSets?: { id: number; title: string }[];
  // Back-compat: first todoset id for surfaces that only need one. Equals
  // `todoSets?.[0]?.id`. Renderer code that still reads this keeps working.
  todoSetId?: number;
  timesheetEnabled?: boolean;
}

// A Basecamp todo the user has committed to focusing on today. Stored locally,
// resets at midnight (the planner is a daily ritual, not a permanent list).
export interface PinnedTodo {
  todoId: number;
  projectId: number;
  todoListId: number;
  accountId: number;
  content: string;        // todo title cached at pin time
  projectName: string;    // project name cached at pin time
  estimateMinutes?: number; // optional Newport-style "deep schedule" estimate
  // Local "I finished this" flag, independent of Basecamp's own completed state.
  // Toggled from the Plan view; drives midnight rollover (completed items get
  // dropped, unfinished ones carry to the next day).
  completedAt?: string;   // ISO timestamp when the user marked it done
  // v5.1.4 — Per-task draft notes that survive switching the active timer.
  // Type a note while timing task A → switch to task B → switch back to A:
  // the note is restored. Persists across stop/start cycles too (user
  // explicitly chose persist-not-clear semantics — they treat notes as
  // ongoing scratch context tied to the task, not to a single session).
  draftNotes?: string;
  // v5.3 — Local check state per subtask. Subtasks are fetched live from
  // Basecamp; this map only tracks "I marked this subtask done on my side
  // today." Time tracking still goes to the parent todo. Reset at midnight
  // rollover along with completedAt. Keyed by subtask id → ISO timestamp.
  subtaskCompletions?: Record<number, string>;
}

// v5.3 — Lightweight subtask shape. We only need id + content + completed
// for display under the parent in the Today tab and pin picker. Time entries
// always post to the PARENT, never to a subtask.
export interface BasecampSubtask {
  id: number;
  content: string;
  completed: boolean;
  appUrl: string;
}

export interface TodayPlan {
  date: string;           // YYYY-MM-DD — used to auto-reset at the next day
  items: PinnedTodo[];
}

// Track recently-used Basecamp todos so the popover can offer one-tap restart
// without forcing the full Project → List → Todo drill-down every time.
export interface RecentTodo {
  todoId: number;
  projectId: number;
  todoListId: number;
  accountId: number;
  content: string;
  projectName: string;
  lastUsedAt: string;     // ISO timestamp — most-recent first
}

export interface BasecampTimesheetEntry {
  id: number;
  date: string;          // YYYY-MM-DD
  hours: string;         // decimal as string, e.g. "1.5"
  description?: string;
  parentId: number;      // recording id (todo or message)
  parentTitle?: string;
  parentType?: string;
  personId: number;
  personName: string;
  appUrl: string;
}

export interface BasecampTodoList {
  id: number;
  title: string;
  description?: string;
  todosUrl: string;
  groupsUrl?: string;
}

export interface BasecampTodo {
  id: number;
  content: string;
  description?: string;
  completed: boolean;
  assigneeIds: number[];
  dueOn?: string;
  parentId?: number;
  commentsCount: number;
  // v5.3 — Subtasks count hint from Basecamp. Drives the "▸ N subtasks"
  // expand affordance in the pin picker without forcing a fetch on every
  // row. The actual subtasks are loaded lazily via BC_GET_SUBTASKS.
  subtasksCount?: number;
  url: string;
  appUrl: string;
}

// A todo from GET /my/assignments.json — cross-project, includes bucket and
// parent (todolist) inline so we can pin without an extra fetch.
export interface MyAssignment {
  id: number;
  content: string;
  type: string;          // "Todo" — could theoretically be Card; we filter to Todo
  url: string;
  appUrl: string;
  dueOn?: string;        // YYYY-MM-DD
  bucket: {
    id: number;          // = projectId
    name: string;
    type: string;        // "Project"
  };
  parent?: {
    id: number;          // = todoListId
    title: string;
    type: string;        // "Todolist"
  };
  assignees: { id: number; name: string }[];
}

export interface MyAssignmentsResponse {
  priorities: MyAssignment[];
  nonPriorities: MyAssignment[];
}

// Scope filter values accepted by GET /my/assignments/due.json
export type MyAssignmentsDueScope =
  | 'overdue'
  | 'due_today'
  | 'due_tomorrow'
  | 'due_later_this_week'
  | 'due_next_week'
  | 'due_later';

// v5.2 — A Basecamp person on a project. Used by the multi-person time-entry
// picker on the "Review before posting" popup. `canAccessTimesheet` gates who
// can have time entries posted for them; `admin` decides whether the current
// user is *allowed* to post for others (Basecamp returns 403 otherwise — we
// handle that gracefully per-person).
export interface BasecampPerson {
  id: number;
  name: string;
  emailAddress: string;
  avatarUrl?: string;
  title?: string;
  admin: boolean;
  client: boolean;
  canAccessTimesheet: boolean;
}

// v5.2 — A Basecamp automatic-check-ins questionnaire on a project. One per
// project; contains multiple questions ("What will you work on today?" etc).
export interface BasecampQuestionnaire {
  id: number;
  title: string;
  url: string;
  appUrl: string;
}

// v5.2 — A single check-in question. Schedule + active flag determine when
// it's prompted to users.
export interface BasecampQuestion {
  id: number;
  title: string;       // the question text e.g. "What will you work on today?"
  url: string;
  appUrl: string;
  scheduleDays?: string[]; // ['monday', 'tuesday', ...] when the question fires
  paused: boolean;     // when true, the question is not currently being asked
}

// v5.2 — One person's answer to a question (one check-in response).
export interface BasecampQuestionAnswer {
  id: number;
  content: string;
  createdAt: string;
  creator: { id: number; name: string };
}

// v5.2 — One notification from /my/readings.json. Powers the "Hey!"
// replacement badge + panel in the popover. Field names map to Basecamp's
// flat shape — `bucket_name` is a plain string, not a nested object.
export interface BasecampNotification {
  id: number;
  section: 'inbox' | 'chats' | 'pings' | 'remembered' | 'mentions';
  title: string;       // the readable's title (e.g. "Kickoff meeting notes")
  excerpt?: string;    // content_excerpt — first paragraph of the readable
  recordingType?: string;  // type field — 'Recording', 'Event', etc.
  appUrl: string;      // basecamp.com URL to open the source item
  createdAt: string;
  bucketName?: string; // the project name (Basecamp's `bucket_name`)
  creatorName?: string; // who created or last updated the item
}

export interface BasecampNotificationsResponse {
  unreads: BasecampNotification[];
  reads: BasecampNotification[];
}

// A search hit from GET /search.json?type=Todo. The shape lines up with
// MyAssignment closely so the same row component can render both.
export interface TodoSearchResult {
  id: number;
  type: string;          // "Todo"
  title: string;         // matched title (may contain <em>...</em> highlights)
  excerpt?: string;
  url: string;
  appUrl: string;
  bucket: {
    id: number;
    name: string;
    type: string;
  };
  parent?: {
    id: number;
    title: string;
    type: string;
  };
  createdAt: string;
}

// ── License Types ──────────────────────────────────────────────

export interface LicensePayload {
  teamName: string;
  seats: number;
  expiresAt: string; // ISO date
  features: string[];
  issuedAt: string;  // ISO date
}

export interface LicenseState {
  isValid: boolean;
  isPro: boolean;
  isAdmin: boolean;
  payload: LicensePayload | null;
  error?: string;
}

// IPC channel names for main ↔ renderer communication
export const IPC = {
  // Networking events (main → renderer)
  PEER_DISCOVERED: 'peer:discovered',
  PEER_UPDATED: 'peer:updated',
  PEER_LOST: 'peer:lost',
  MEETING_REQUEST: 'meeting:request',
  MEETING_REQUEST_CANCEL: 'meeting:request-cancel',
  MEETING_RESPONSE: 'meeting:response',
  EMERGENCY_REQUEST: 'emergency:request',
  EMERGENCY_ACCESS: 'emergency:access',

  // User actions (renderer → main)
  UPDATE_STATUS: 'user:update-status',
  UPDATE_USER: 'user:update',
  SEND_MEETING_REQUEST: 'user:send-meeting-request',
  CANCEL_MEETING_REQUEST: 'user:cancel-meeting-request',
  RESPOND_MEETING_REQUEST: 'user:respond-meeting-request',
  SEND_EMERGENCY_REQUEST: 'user:send-emergency-request',
  GRANT_EMERGENCY_ACCESS: 'user:grant-emergency-access',

  // Window management (renderer → main)
  OPEN_DASHBOARD: 'window:open-dashboard',
  OPEN_DASHBOARD_AND_PIN: 'window:open-dashboard-and-pin',
  CLOSE_POPOVER: 'window:close-popover',
  QUIT_APP: 'app:quit',

  // Timer (renderer → main, bidirectional)
  START_TIMER: 'timer:start',
  STOP_TIMER: 'timer:stop',
  PAUSE_TIMER: 'timer:pause',
  RESUME_TIMER: 'timer:resume',
  TIMER_UPDATE: 'timer:update',
  TIMER_COMPLETE: 'timer:complete',

  // Data (renderer → main)
  GET_USER: 'data:get-user',
  GET_PEERS: 'data:get-peers',
  GET_RECORDS: 'data:get-records',
  SAVE_USER: 'data:save-user',
  DELETE_SESSION: 'data:delete-session',
  UPDATE_SESSION: 'data:update-session',
  ADD_SESSION: 'data:add-session',

  // Settings & Templates (renderer → main)
  GET_SETTINGS: 'data:get-settings',
  SAVE_SETTINGS: 'data:save-settings',

  // Break/Idle/Revert notifications (main → renderer)
  BREAK_REMINDER: 'timer:break-reminder',
  TIMER_AUTO_PAUSED: 'timer:auto-paused',
  STATUS_REVERT_TICK: 'status:revert-tick',

  // Status revert (renderer → main)
  SET_STATUS_REVERT: 'status:set-revert',
  CANCEL_STATUS_REVERT: 'status:cancel-revert',

  // Long-run timer guard (renderer → main)
  TIMER_LONG_RUN_RESPONSE: 'timer:long-run-response',

  // Idle prompt: instead of silently auto-pausing after the idle threshold,
  // show a "still working?" alert that the user can confirm or let lapse.
  TIMER_IDLE_RESPONSE: 'timer:idle-response',

  // Meeting mode: per-session toggle that suppresses idle pause entirely
  // (for video calls where the user isn't touching keyboard/mouse).
  TIMER_SET_MEETING_MODE: 'timer:set-meeting-mode',
  TIMER_MEETING_MODE_CHANGED: 'timer:meeting-mode-changed',

  // Pre-flight Basecamp timesheet confirmation (renderer → main)
  TIMER_TIMESHEET_CONFIRM: 'timer:timesheet-confirm',
  // Mini-timer pill state changes (renderer → main)
  MINI_TIMER_RESIZE: 'mini-timer:resize',
  MINI_TIMER_MOVE_BY: 'mini-timer:move-by',
  // In-progress notes capture from the pill — flushed at stop time so users
  // can jot what they're working on without waiting for the confirm popup.
  MINI_TIMER_GET_NOTES: 'mini-timer:get-notes',
  MINI_TIMER_SET_NOTES: 'mini-timer:set-notes',

  // Quick ping (team-wide lightweight notification — distinct from admin notification)
  TEAM_SEND_PING: 'team:send-ping',          // renderer → main
  TEAM_PING_RECEIVED: 'team:ping-received',  // main → renderer
  TEAM_GET_RECENT_PINGS: 'team:get-recent-pings',
  TEAM_DISMISS_PING: 'team:dismiss-ping',

  // Peer groups (saved sets of people for one-tap multi-select)
  GROUPS_GET: 'groups:get',
  GROUPS_SAVE: 'groups:save',          // create or update — full PeerGroup payload
  GROUPS_DELETE: 'groups:delete',

  // Admin notifications (bidirectional)

  // Tray updates (renderer → main)
  UPDATE_TRAY: 'tray:update',

  // License (renderer → main)
  ACTIVATE_LICENSE: 'license:activate',
  GET_LICENSE_STATE: 'license:get-state',
  DEACTIVATE_LICENSE: 'license:deactivate',

  // Basecamp (renderer → main)
  BC_GET_CREDENTIALS: 'basecamp:get-credentials',
  BC_SAVE_CREDENTIALS: 'basecamp:save-credentials',
  BC_CONNECT: 'basecamp:connect',
  BC_CANCEL_CONNECT: 'basecamp:cancel-connect',
  BC_DISCONNECT: 'basecamp:disconnect',
  BC_GET_AUTH_STATE: 'basecamp:get-auth-state',
  BC_LIST_PROJECTS: 'basecamp:list-projects',
  BC_LIST_TODO_LISTS: 'basecamp:list-todo-lists',
  BC_LIST_TODOS: 'basecamp:list-todos',
  BC_CREATE_TODO: 'basecamp:create-todo',
  BC_POST_COMMENT: 'basecamp:post-comment',
  BC_CREATE_TIME_ENTRY: 'basecamp:create-time-entry',
  // v5.1.0 — propagate local edits/deletes back to Basecamp using the
  // entry id persisted on DailySession.basecamp.entryId.
  BC_UPDATE_TIME_ENTRY: 'basecamp:update-time-entry',
  BC_DELETE_TIME_ENTRY: 'basecamp:delete-time-entry',
  BC_GET_PROJECT_TIMESHEET: 'basecamp:get-project-timesheet',
  BC_BACKFILL_TIMESHEET: 'basecamp:backfill-timesheet',
  // v5.1.0 — pin UX shortcuts. /my/assignments.json removes the 3-layer drill
  // for the common "pin one of my todos" case; search/due are tab fallbacks.
  BC_GET_MY_ASSIGNMENTS: 'basecamp:get-my-assignments',
  BC_GET_MY_ASSIGNMENTS_DUE: 'basecamp:get-my-assignments-due',
  BC_SEARCH_TODOS: 'basecamp:search-todos',
  // v5.2 — Project members (for the multi-person time-entry picker).
  BC_LIST_PROJECT_MEMBERS: 'basecamp:list-project-members',
  // v5.2 — Automatic check-ins. Discover the questionnaire on a project,
  // list its questions, post an answer.
  BC_LIST_QUESTIONNAIRES: 'basecamp:list-questionnaires',
  BC_GET_QUESTIONS: 'basecamp:get-questions',
  BC_POST_QUESTION_ANSWER: 'basecamp:post-question-answer',
  // v5.2 — My notifications ("Hey!" replacement).
  BC_GET_NOTIFICATIONS: 'basecamp:get-notifications',
  BC_MARK_NOTIFICATION_READ: 'basecamp:mark-notification-read',
  // v5.3 — Subtasks of a parent todo. Used by the pin picker (browse +
  // search expand affordance) and by the Today tab to show subtasks as a
  // checklist under each pinned row. Time tracking stays at the parent.
  BC_GET_SUBTASKS: 'basecamp:get-subtasks',
  // v5.2 — Main → renderer event when the 9am check-in scheduler decides
  // it's time to prompt the user. Renderer opens CheckInModal in response.
  CHECKIN_PROMPT: 'checkin:prompt',
  BC_AUTH_CHANGED: 'basecamp:auth-changed', // main → renderer

  // Today plan + Recents (renderer → main)
  TODAY_GET: 'today:get',
  TODAY_PIN: 'today:pin',
  TODAY_PIN_MANY: 'today:pin-many', // v5.1.0 — batch pin from new PinPicker
  TODAY_UNPIN: 'today:unpin',
  TODAY_REORDER: 'today:reorder',
  TODAY_SET_ESTIMATE: 'today:set-estimate',
  TODAY_TOGGLE_COMPLETE: 'today:toggle-complete',
  // v5.3 — Toggle the local check state for a subtask under a pinned todo.
  // Purely local — Basecamp is not touched. Resets at midnight rollover.
  TODAY_TOGGLE_SUBTASK: 'today:toggle-subtask',
  TODAY_CHANGED: 'today:changed', // main → renderer
  RECENTS_GET: 'recents:get',

  // Tomorrow plan — same shape as today, separate slot. At midnight rollover,
  // tomorrow's items merge into today's (along with today's unfinished carry-overs).
  TOMORROW_GET: 'tomorrow:get',
  TOMORROW_PIN: 'tomorrow:pin',
  TOMORROW_PIN_MANY: 'tomorrow:pin-many', // v5.1.0 — batch pin
  TOMORROW_UNPIN: 'tomorrow:unpin',
  TOMORROW_REORDER: 'tomorrow:reorder',
  TOMORROW_SET_ESTIMATE: 'tomorrow:set-estimate',
  TOMORROW_TOGGLE_COMPLETE: 'tomorrow:toggle-complete',
  TOMORROW_CHANGED: 'tomorrow:changed', // main → renderer

  // v5.1.0 — alert windows fetch their current payload on mount instead of
  // relying on the one-shot 'alert-data' broadcast (fixes the blank-window
  // race when the renderer initialises after main has already sent).
  ALERT_GET_DATA: 'alert:get-data',
} as const;

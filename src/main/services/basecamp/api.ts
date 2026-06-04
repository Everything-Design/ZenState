import { BasecampOAuth, BC_USER_AGENT } from './oauth';
import {
  BasecampProject,
  BasecampTodoList,
  BasecampTodo,
  BasecampSubtask,
  BasecampTimesheetEntry,
  MyAssignment,
  MyAssignmentsResponse,
  MyAssignmentsDueScope,
  TodoSearchResult,
  BasecampPerson,
  BasecampQuestionnaire,
  BasecampQuestion,
  BasecampNotification,
  BasecampNotificationsResponse,
} from '../../../shared/types';

interface RawProject {
  id: number;
  name: string;
  description?: string;
  dock?: Array<{ id: number; name: string; title?: string; enabled: boolean; url: string }>;
  timesheet_enabled?: boolean;
}

interface RawTimesheetEntry {
  id: number;
  date: string;
  hours: string;
  description?: string;
  parent: { id: number; title?: string; type?: string };
  person: { id: number; name: string };
  app_url: string;
}

interface RawTodoSet {
  id: number;
  todolists_url: string;
}

interface RawTodoList {
  id: number;
  title: string;
  description?: string;
  todos_url: string;
  groups_url?: string;
}

interface RawTodo {
  id: number;
  content: string;
  description?: string;
  completed: boolean;
  due_on?: string;
  parent?: { id: number } | null;
  comments_count: number;
  // v5.3 — Subtasks hint. `subtasks_count` lets the UI show a "▸ N subtasks"
  // affordance without a fetch; `subtasks_url` is the canonical URL when BC
  // exposes one. Not all BC accounts return these — we degrade if missing.
  subtasks_count?: number;
  subtasks_url?: string;
  url: string;
  app_url: string;
  assignees: Array<{ id: number }>;
}

// Shape returned by /my/assignments.json — same item shape used for both
// `priorities` and `non_priorities` buckets in the response.
interface RawMyAssignment {
  id: number;
  type: string;            // "Todo" (we filter the rest)
  title?: string;          // sometimes the API returns `title` for non-Todo recordings
  content?: string;        // todos use `content`
  url: string;
  app_url: string;
  due_on?: string;
  bucket: { id: number; name: string; type: string };
  parent?: { id: number; title: string; type: string };
  assignees?: Array<{ id: number; name: string }>;
}

interface RawMyAssignmentsResponse {
  priorities: RawMyAssignment[];
  non_priorities: RawMyAssignment[];
}

interface RawSearchHit {
  id: number;
  type: string;
  title: string;
  excerpt?: string;
  url: string;
  app_url: string;
  bucket: { id: number; name: string; type: string };
  parent?: { id: number; title: string; type: string };
  created_at: string;
}

// v5.2 — Raw shapes for the new endpoints. Kept loose to absorb any field
// drift in the Basecamp API (we only consume what we mapped explicitly).
interface RawPerson {
  id: number;
  name: string;
  email_address: string;
  avatar_url?: string;
  title?: string;
  admin?: boolean;
  client?: boolean;
  can_access_timesheet?: boolean;
}

interface RawQuestionnaire {
  id: number;
  title: string;
  url: string;
  app_url: string;
}

interface RawQuestion {
  id: number;
  title: string;
  url: string;
  app_url: string;
  paused?: boolean;
  schedule?: { days?: string[] };
}

// Basecamp's /my/readings.json returns flat fields (NOT a nested bucket
// object like other endpoints): bucket_name, content_excerpt, type.
interface RawNotification {
  id: number;
  section: 'inbox' | 'chats' | 'pings' | 'remembered' | 'mentions';
  title?: string;
  bucket_name?: string;
  type?: string;            // Recording, Event, etc.
  content_excerpt?: string;
  app_url?: string;
  created_at: string;
  creator?: { id: number; name: string };
}

interface RawNotificationsResponse {
  unreads?: RawNotification[];
  reads?: RawNotification[];
  memories?: RawNotification[];
}

// v5.4.0 — Card Table response shapes. Cards live in columns ("lists") inside
// a card_table recording. We flatten across columns for the picker.
interface RawCardTable {
  id: number;
  title: string;
  lists?: RawCardColumn[];
}

interface RawCardColumn {
  id: number;
  title: string;
  type: string;            // 'Kanban::Triage' | 'Kanban::NotNowColumn' | 'Kanban::Column' | 'Kanban::DoneColumn'
  cards_count?: number;
  cards_url?: string;
}

interface RawCard {
  id: number;
  title?: string;          // short label — what we display as content
  content?: string;        // longer rich-text description
  completed?: boolean;
  due_on?: string;
  url: string;
  app_url: string;
  assignees?: Array<{ id: number }>;
  parent?: { id: number; title?: string; type?: string };
  comments_count?: number;
}

const MAX_AUTH_RETRIES = 1;
const MAX_RATE_LIMIT_RETRIES = 3;
// Cap how long we'll honour a Retry-After header. Basecamp can return arbitrary
// values; we don't want a single IPC handler to hold open for an hour.
const MAX_RATE_LIMIT_WAIT_SEC = 60;

export class BasecampApi {
  constructor(private readonly oauth: BasecampOAuth) {}

  // Authenticated fetch with auto-refresh on 401 and bounded backoff on 429.
  private async fetchAuth(url: string, init: RequestInit = {}, opts: { authRetries?: number; rateRetries?: number } = {}): Promise<Response> {
    const authRetries = opts.authRetries ?? MAX_AUTH_RETRIES;
    const rateRetries = opts.rateRetries ?? MAX_RATE_LIMIT_RETRIES;

    const token = await this.oauth.getAccessToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': BC_USER_AGENT,
      'Accept': 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };

    const res = await fetch(url, { ...init, headers });

    if (res.status === 401 && authRetries > 0) {
      // Force the next getAccessToken() call to refresh, then retry once.
      this.oauth.forceExpire();
      return this.fetchAuth(url, init, { authRetries: authRetries - 1, rateRetries });
    }

    if (res.status === 429 && rateRetries > 0) {
      const headerValue = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      const waitSec = Math.min(MAX_RATE_LIMIT_WAIT_SEC, Math.max(1, isFinite(headerValue) ? headerValue : 5));
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      return this.fetchAuth(url, init, { authRetries, rateRetries: rateRetries - 1 });
    }

    return res;
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchAuth(url, init);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Basecamp API ${res.status}: ${body || res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // Walks Link: rel="next" pagination, returning a flattened list.
  private async paginate<T>(firstUrl: string): Promise<T[]> {
    const all: T[] = [];
    let url: string | null = firstUrl;
    while (url) {
      const res = await this.fetchAuth(url);
      if (!res.ok) throw new Error(`Basecamp API ${res.status}: ${await res.text()}`);
      const page = (await res.json()) as T[];
      all.push(...page);
      url = parseNext(res.headers.get('Link'));
    }
    return all;
  }

  private accountBase(): string {
    // Prefer the account `href` returned by the auth info call, since Basecamp
    // is the source of truth for the API base URL. Fall back to the canonical
    // host (3.basecampapi.com — note "api", not "app") if href isn't stored.
    const href = this.oauth.getAccountHref();
    if (href) return href.replace(/\/$/, '');
    return `https://3.basecampapi.com/${this.oauth.getAccountId()}`;
  }

  async listProjects(): Promise<BasecampProject[]> {
    const raw = await this.paginate<RawProject>(`${this.accountBase()}/projects.json`);
    return raw.map((p) => {
      // v5.3.1 — Collect ALL todoset dock entries. A project can have several
      // when the user has added extra "tools" (cloned Todo lists) — each is a
      // separate dock entry with `name: 'todoset'` and a user-set title.
      const todoSets = (p.dock ?? [])
        .filter((d) => d.name === 'todoset' && d.enabled)
        .map((d) => ({ id: d.id, title: d.title ?? 'To-dos' }));
      // v5.4.0 — Same pattern for Card Tables. A project can enable Kanban
      // boards as additional tools; each shows up in the dock with
      // `name: 'kanban_board'`. We surface them as virtual "lists" in the
      // picker — the user picks a card table, sees all its cards flat.
      const cardTables = (p.dock ?? [])
        .filter((d) => d.name === 'kanban_board' && d.enabled)
        .map((d) => ({ id: d.id, title: d.title ?? 'Card Table' }));
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        todoSets,
        todoSetId: todoSets[0]?.id, // back-compat
        cardTables,
        timesheetEnabled: p.timesheet_enabled === true,
      };
    });
  }

  async listTodoLists(projectId: number, todoSetId: number): Promise<BasecampTodoList[]> {
    const set = await this.requestJson<RawTodoSet>(`${this.accountBase()}/buckets/${projectId}/todosets/${todoSetId}.json`);
    const lists = await this.paginate<RawTodoList>(set.todolists_url);
    return lists.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      todosUrl: l.todos_url,
      groupsUrl: l.groups_url,
    }));
  }

  // v5.3 — Returns ALL todos in a list, including those nested inside groups.
  //
  // Basecamp's /todolists/{listId}/todos.json endpoint returns ONLY the
  // ungrouped todos at the list root. If a project organises its todos into
  // groups (sections within a list, common pattern), the parent endpoint
  // returns an empty array and the user sees nothing in the picker —
  // confusingly, since they SEE the todos in Basecamp's web UI.
  //
  // Each group is itself a todolist (with its own id + todos_url) accessed
  // via the parent list's groups.json sub-resource. We fetch the parent's
  // direct todos AND every group's todos in parallel, then flatten.
  async listTodos(projectId: number, todoListId: number): Promise<BasecampTodo[]> {
    const baseList = `${this.accountBase()}/buckets/${projectId}/todolists/${todoListId}`;

    // Fetch direct todos + groups in parallel. Groups are best-effort: a
    // 404 (or no groups feature on the account) just means there are none.
    const [directTodos, groups] = await Promise.all([
      this.paginate<RawTodo>(`${baseList}/todos.json`),
      this.paginate<RawTodoList>(`${baseList}/groups.json`).catch(() => [] as RawTodoList[]),
    ]);

    // Fan out per-group todo fetches in parallel. Each group is structured
    // as its own todolist — its todos live at its own todos_url.
    const groupTodos = await Promise.all(
      groups.map((g) =>
        this.paginate<RawTodo>(g.todos_url).catch(() => [] as RawTodo[]),
      ),
    );

    const all: RawTodo[] = [...directTodos, ...groupTodos.flat()];
    return all.map(this.mapTodo);
  }

  // v5.3.1 — Subtasks are NOT exposed by Basecamp's public API. The bc3-api
  // documentation (which is also the BC4 + BC5 API source of truth) has zero
  // mention of "subtask" across all 41 section files. The `parent` field on a
  // Todo always refers to its containing TodoList, never another Todo. The
  // subtask feature visible in Basecamp's web UI (and now in BC5) is rendered
  // server-side and not surfaced through any documented endpoint.
  //
  // We keep this method as a stable hook for when Basecamp eventually ships
  // subtask API support — the IPC, preload bridge, types, and PinnedTodo
  // `subtaskCompletions` field are all wired and waiting. Currently returns
  // empty list so the renderer degrades silently.
  async getSubtasksForTodo(_projectId: number, _parentTodoId: number): Promise<BasecampSubtask[]> {
    return [];
  }

  // v5.4.0 — Flatten all cards from a Card Table into a single BasecampTodo[]
  // list. Skips the Done column entirely (parallels how we hide completed
  // todos). Cards remain in their `completed: false` state in active columns
  // (Triage / Not Now / Column) — those are still pickable.
  //
  // Flow:
  //   1. GET /buckets/{p}/card_tables/{id}.json → returns the table with its
  //      columns ("lists" in BC parlance) inline.
  //   2. For each non-Done column, paginate its cards_url in parallel.
  //   3. Filter out completed cards (belt-and-suspenders — Done column should
  //      already cover this, but cards can be completed-in-place too).
  //   4. Map each card to BasecampTodo so the picker + Today tab can render
  //      it identically to a todo. Cards use `title` as their short label;
  //      `content` is the longer description.
  async listCardsForTable(projectId: number, cardTableId: number): Promise<BasecampTodo[]> {
    const table = await this.requestJson<RawCardTable>(
      `${this.accountBase()}/buckets/${projectId}/card_tables/${cardTableId}.json`,
    );
    const activeColumns = (table.lists ?? []).filter((c) => c.type !== 'Kanban::DoneColumn');
    const columnFetches = await Promise.all(
      activeColumns.map((col) =>
        col.cards_url
          ? this.paginate<RawCard>(col.cards_url).catch(() => [] as RawCard[])
          : Promise.resolve([] as RawCard[]),
      ),
    );
    const allCards = columnFetches.flat().filter((c) => !c.completed);
    return allCards.map((c) => this.mapCard(c));
  }

  private mapCard(c: RawCard): BasecampTodo {
    // Cards have BOTH `title` (short) and `content` (long rich text). The
    // picker shows the row's `content` field as the visible label, so we map
    // card.title → BasecampTodo.content. This matches what users see in
    // Basecamp's Kanban UI (the card's bold title).
    return {
      id: c.id,
      content: c.title ?? c.content ?? '',
      description: c.content,
      completed: c.completed === true,
      assigneeIds: c.assignees?.map((a) => a.id) ?? [],
      dueOn: c.due_on,
      parentId: c.parent?.id,
      commentsCount: c.comments_count ?? 0,
      url: c.url,
      appUrl: c.app_url,
    };
  }

  async createTodo(input: {
    projectId: number;
    todoListId: number;
    content: string;
    description?: string;
    parentId?: number;
    dueOn?: string;
  }): Promise<BasecampTodo> {
    const body: Record<string, unknown> = { content: input.content };
    if (input.description) body.description = input.description;
    if (input.parentId) body.parent_id = input.parentId;
    if (input.dueOn) body.due_on = input.dueOn;

    const todo = await this.requestJson<RawTodo>(
      `${this.accountBase()}/buckets/${input.projectId}/todolists/${input.todoListId}/todos.json`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return this.mapTodo(todo);
  }

  async postComment(input: { projectId: number; todoId: number; content: string }): Promise<void> {
    await this.requestJson<void>(
      `${this.accountBase()}/buckets/${input.projectId}/recordings/${input.todoId}/comments.json`,
      { method: 'POST', body: JSON.stringify({ content: input.content }) },
    );
  }

  // Create a Basecamp timesheet entry on a recording (to-do).
  // `hours` accepts decimal ("1.5") or H:MM ("1:30") format.
  async createTimesheetEntry(input: {
    todoId: number;
    date: string;
    hours: string;
    description?: string;
    // v5.2 — Optional `personId` for the multi-person time-entry feature.
    // When omitted, Basecamp defaults to the authenticated user. When set
    // to a project member, Basecamp may return 403 if the authenticated
    // user lacks permission to log time on someone else's behalf — the
    // caller handles that per-person.
    personId?: number;
  }): Promise<BasecampTimesheetEntry> {
    const body: Record<string, unknown> = { date: input.date, hours: input.hours };
    if (input.description) body.description = input.description;
    if (input.personId) body.person_id = input.personId;

    const raw = await this.requestJson<RawTimesheetEntry>(
      `${this.accountBase()}/recordings/${input.todoId}/timesheet/entries.json`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return this.mapTimesheetEntry(raw);
  }

  // Get all timesheet entries for a project (paginated). Use this to compute
  // per-todo totals by grouping on `parentId` and summing `hours`.
  async getProjectTimesheet(projectId: number): Promise<BasecampTimesheetEntry[]> {
    const raw = await this.paginate<RawTimesheetEntry>(`${this.accountBase()}/projects/${projectId}/timesheet.json`);
    return raw.map((r) => this.mapTimesheetEntry(r));
  }

  // Update an existing Basecamp timesheet entry. Uses the flat route — note
  // that `recording_id` (parent) is immutable here; re-parenting requires
  // delete + create. Only the fields supplied are touched.
  async updateTimesheetEntry(entryId: number, fields: {
    date?: string;
    hours?: string;
    description?: string;
    personId?: number;
  }): Promise<BasecampTimesheetEntry> {
    const body: Record<string, unknown> = {};
    if (fields.date !== undefined) body.date = fields.date;
    if (fields.hours !== undefined) body.hours = fields.hours;
    if (fields.description !== undefined) body.description = fields.description;
    if (fields.personId !== undefined) body.person_id = fields.personId;

    const raw = await this.requestJson<RawTimesheetEntry>(
      `${this.accountBase()}/timesheet_entries/${entryId}.json`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    return this.mapTimesheetEntry(raw);
  }

  // Permanently delete a timesheet entry (Basecamp does not trash these; gone is gone).
  async deleteTimesheetEntry(entryId: number): Promise<void> {
    await this.requestJson<void>(
      `${this.accountBase()}/timesheet_entries/${entryId}.json`,
      { method: 'DELETE' },
    );
  }

  // v5.4.0 — Recognised types for "things you can pin and track time on."
  // BC normalises card-table assignments to lowercase `"todo"` in
  // /my/assignments.json, while everywhere else uses CapitalCase model names
  // (`Todo`, `Kanban::Card`). Accepting all three covers todos, lowercase
  // normalised assignments (incl. cards from card tables), and explicit
  // Kanban cards.
  private isPinnableType(t: string): boolean {
    return t === 'Todo' || t === 'todo' || t === 'Kanban::Card';
  }

  // Fetch todos assigned to the authenticated user across all projects, grouped
  // into priorities and non-priorities. One request replaces the project → list
  // → todo drill-down for the common "pin one of my todos" case.
  // v5.4.0 — Now also includes assigned Card Table cards (BC's
  // /my/assignments normalises them under the same response).
  async getMyAssignments(): Promise<MyAssignmentsResponse> {
    const raw = await this.requestJson<RawMyAssignmentsResponse>(
      `${this.accountBase()}/my/assignments.json`,
    );
    return {
      priorities: (raw.priorities ?? [])
        .filter((r) => this.isPinnableType(r.type))
        .map((r) => this.mapMyAssignment(r)),
      nonPriorities: (raw.non_priorities ?? [])
        .filter((r) => this.isPinnableType(r.type))
        .map((r) => this.mapMyAssignment(r)),
    };
  }

  // Same shape as getMyAssignments, filtered to a due-date scope.
  // Scopes: 'overdue' | 'due_today' | 'due_tomorrow' | 'due_later_this_week'
  //         | 'due_next_week' | 'due_later'.
  async getMyAssignmentsDue(scope: MyAssignmentsDueScope): Promise<MyAssignment[]> {
    const url = `${this.accountBase()}/my/assignments/due.json?scope=${encodeURIComponent(scope)}`;
    const raw = await this.paginate<RawMyAssignment>(url);
    return raw.filter((r) => this.isPinnableType(r.type)).map((r) => this.mapMyAssignment(r));
  }

  // Full-text search across the authenticated user's account. v5.4.0 —
  // searches Todos AND Kanban Cards in parallel and merges the results.
  // Order: cards appended after todos (BC orders within each set by relevance).
  async searchTodos(query: string): Promise<TodoSearchResult[]> {
    const todoUrl = `${this.accountBase()}/search.json?q=${encodeURIComponent(query)}&type=Todo`;
    const cardUrl = `${this.accountBase()}/search.json?q=${encodeURIComponent(query)}&type=Kanban::Card`;
    const [todoHits, cardHits] = await Promise.all([
      this.paginate<RawSearchHit>(todoUrl).catch(() => [] as RawSearchHit[]),
      this.paginate<RawSearchHit>(cardUrl).catch(() => [] as RawSearchHit[]),
    ]);
    const hits = [...todoHits, ...cardHits];
    return hits.map((h) => ({
      id: h.id,
      type: h.type,
      title: h.title,
      excerpt: h.excerpt,
      url: h.url,
      appUrl: h.app_url,
      bucket: h.bucket,
      parent: h.parent,
      createdAt: h.created_at,
    }));
  }

  // v5.2 — Project members. Used by the multi-person time-entry picker to
  // show who the user can post on behalf of. `canAccessTimesheet` filters
  // clients out (they can't have timesheet entries). The Basecamp API
  // returns admin/owner/client flags directly.
  async listProjectMembers(projectId: number): Promise<BasecampPerson[]> {
    const raw = await this.paginate<RawPerson>(`${this.accountBase()}/projects/${projectId}/people.json`);
    return raw.map((p) => ({
      id: p.id,
      name: p.name,
      emailAddress: p.email_address,
      avatarUrl: p.avatar_url,
      title: p.title,
      admin: p.admin ?? false,
      client: p.client ?? false,
      canAccessTimesheet: p.can_access_timesheet ?? false,
    }));
  }

  // v5.2 — Discover automatic check-ins for a project. Returns the project's
  // questionnaire (one per project) — or null if check-ins aren't enabled.
  // The questionnaire ID comes from the project's dock entry (similar pattern
  // to todoset discovery).
  async getQuestionnaireForProject(projectId: number): Promise<BasecampQuestionnaire | null> {
    interface RawProjectWithDock {
      id: number;
      dock?: Array<{ id: number; name: string; title?: string; enabled: boolean; url: string }>;
    }
    const proj = await this.requestJson<RawProjectWithDock>(`${this.accountBase()}/projects/${projectId}.json`);
    const questionnaireDock = proj.dock?.find((d) => d.name === 'questionnaire' && d.enabled);
    if (!questionnaireDock) return null;
    const raw = await this.requestJson<RawQuestionnaire>(`${this.accountBase()}/buckets/${projectId}/questionnaires/${questionnaireDock.id}.json`);
    return {
      id: raw.id,
      title: raw.title,
      url: raw.url,
      appUrl: raw.app_url,
    };
  }

  // v5.2 — List the questions inside a questionnaire.
  async listQuestions(projectId: number, questionnaireId: number): Promise<BasecampQuestion[]> {
    const raw = await this.paginate<RawQuestion>(`${this.accountBase()}/buckets/${projectId}/questionnaires/${questionnaireId}/questions.json`);
    return raw.map((q) => ({
      id: q.id,
      title: q.title,
      url: q.url,
      appUrl: q.app_url,
      scheduleDays: q.schedule?.days,
      paused: q.paused === true,
    }));
  }

  // v5.2 — Post a check-in answer. The CLI uses the same endpoint for the
  // `check-in answer` command. Content is rich text but plain text works.
  async postQuestionAnswer(projectId: number, questionId: number, content: string): Promise<void> {
    await this.requestJson<void>(
      `${this.accountBase()}/buckets/${projectId}/questions/${questionId}/answers.json`,
      { method: 'POST', body: JSON.stringify({ content }) },
    );
  }

  // v5.2 — User's notification inbox ("Hey!" panel). Returns unreads (capped
  // at 100, unpaginated) + first page of reads.
  async getNotifications(): Promise<BasecampNotificationsResponse> {
    const raw = await this.requestJson<RawNotificationsResponse>(`${this.accountBase()}/my/readings.json`);
    const mapOne = (n: RawNotification): BasecampNotification => ({
      id: n.id,
      section: n.section,
      title: n.title ?? 'Untitled',
      excerpt: n.content_excerpt,
      recordingType: n.type,
      appUrl: n.app_url ?? '',
      createdAt: n.created_at,
      bucketName: n.bucket_name,
      creatorName: n.creator?.name,
    });
    return {
      unreads: (raw.unreads ?? []).map(mapOne),
      reads: (raw.reads ?? []).map(mapOne),
    };
  }

  // v5.2 — Mark a notification as read.
  async markNotificationRead(notificationId: number): Promise<void> {
    await this.requestJson<void>(
      `${this.accountBase()}/my/readings/${notificationId}.json`,
      { method: 'PUT' },
    );
  }

  private mapMyAssignment(r: RawMyAssignment): MyAssignment {
    return {
      id: r.id,
      // todos use `content`; the API occasionally returns `title` for older items
      content: r.content ?? r.title ?? '',
      type: r.type,
      url: r.url,
      appUrl: r.app_url,
      dueOn: r.due_on,
      bucket: r.bucket,
      parent: r.parent,
      assignees: r.assignees ?? [],
    };
  }

  private mapTimesheetEntry(r: RawTimesheetEntry): BasecampTimesheetEntry {
    return {
      id: r.id,
      date: r.date,
      hours: r.hours,
      description: r.description,
      parentId: r.parent.id,
      parentTitle: r.parent.title,
      parentType: r.parent.type,
      personId: r.person.id,
      personName: r.person.name,
      appUrl: r.app_url,
    };
  }

  private mapTodo(t: RawTodo): BasecampTodo {
    return {
      id: t.id,
      content: t.content,
      description: t.description,
      completed: t.completed,
      assigneeIds: t.assignees?.map((a) => a.id) ?? [],
      dueOn: t.due_on,
      parentId: t.parent?.id,
      commentsCount: t.comments_count,
      subtasksCount: t.subtasks_count,
      url: t.url,
      appUrl: t.app_url,
    };
  }
}

function parseNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

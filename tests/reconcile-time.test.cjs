const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ connected = true, timesheetEnabled = true, fail = false, failAt = 0, failDelete = false, sessions } = {}) {
  const source = fs.readFileSync('dist/main/index.js', 'utf8');
  const start = source.indexOf('const reconcileOne = async');
  const end = source.indexOf('// Window management', start);
  assert.ok(start > 0 && end > start);
  const handlers = {};
  const sessionMap = new Map((sessions ?? [{ id: 's1', taskLabel: 'Quick work', startTime: '2026-10-09T08:00:00.000Z', duration: 1800 }]).map(s => [s.id, s]));
  const posts = [];
  const deleted = [];
  const progress = [];
  const tracker = {
    findSession: (id) => sessionMap.has(id) ? structuredClone(sessionMap.get(id)) : null,
    updateSession: (id, _date, updates) => { sessionMap.set(id, { ...sessionMap.get(id), ...updates }); },
  };
  const basecamp = {
    oauth: { isConnected: () => connected, getAccountId: () => 1 },
    api: {
      listProjects: async () => [{ id: 2, name: 'Project', timesheetEnabled }],
      getProjectTimesheetRecordingId: async () => 99,
      createTimesheetEntry: async (data) => { posts.push(data); if (fail || posts.length === failAt) throw new Error('offline'); return { id: 41 + posts.length }; },
      updateTimesheetEntry: async () => ({ id: 42 }),
      deleteTimesheetEntry: async id => { deleted.push(id); if (failDelete) throw new Error('delete failed'); },
    },
  };
  vm.runInNewContext(source.slice(start, end), {
    electron_1: { ipcMain: { handle: (channel, fn) => { handlers[channel] = fn; } } },
    types_1: { IPC: { RECONCILE_SESSION: 'data:reconcile-session', RECONCILE_BATCH: 'data:reconcile-batch', RECONCILE_BATCH_PROGRESS: 'data:reconcile-batch-progress' } },
    timeTracker: tracker, basecamp, postingSessionIds: new Set(), pendingTimesheetEntry: null,
    broadcastToWindows() {}, console,
  });
  return { handler: handlers['data:reconcile-session'], batch: data => handlers['data:reconcile-batch']({ sender: { isDestroyed: () => false, send: (_channel, value) => progress.push(value) } }, data), posts, deleted, progress, current: (id = 's1') => sessionMap.get(id) };
}

test('reviewed time posts to a project recording and saves its entry id', async () => {
  const { handler, posts, current } = setup();
  const result = await handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, notes: 'Drafting', duration: 1800 });
  assert.equal(result.entryId, 42);
  assert.equal(posts[0].recordingId, 99);
  assert.equal(posts[0].description, 'Drafting');
  assert.deepEqual({ synced: current().basecamp.synced, entryId: current().basecamp.entryId }, { synced: true, entryId: 42 });
});

test('reviewed time can post to a to-do', async () => {
  const { handler, posts, current } = setup();
  const result = await handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, todoId: 88, notes: '', duration: 900 });
  assert.equal(result.ok, true);
  assert.equal(posts[0].recordingId, 88);
  assert.equal(current().basecamp.todoId, 88);
});

test('failed or disconnected posts remain available, and disabled timesheets are rejected', async () => {
  const failed = setup({ fail: true });
  assert.equal((await failed.handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, todoId: 88, notes: '', duration: 900 })).ok, false);
  assert.equal(failed.current().basecamp.synced, false);
  assert.equal(failed.current().basecamp.entryId, undefined);
  const disconnected = setup({ connected: false });
  assert.equal((await disconnected.handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, todoId: 88, notes: '', duration: 900 })).ok, false);
  assert.equal(disconnected.posts.length, 0);
  const disabled = setup({ timesheetEnabled: false });
  assert.equal((await disabled.handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, notes: '', duration: 900 })).ok, false);
  assert.equal(disabled.posts.length, 0);
});

test('batch keeps original dates, durations and notes; failed middle post alone remains pending', async () => {
  const fixture = [
    { id: 'a', taskLabel: 'First', duration: 3600, notes: 'First note' },
    { id: 'b', taskLabel: 'Second', duration: 2700, notes: 'Second note' },
    { id: 'c', taskLabel: 'Third', duration: 900, notes: 'Third note' },
  ];
  const state = setup({ sessions: fixture, failAt: 2 });
  const selection = [
    { sessionId: 'a', date: '2026-10-09' },
    { sessionId: 'b', date: '2026-10-10' },
    { sessionId: 'c', date: '2026-10-11' },
  ];
  const result = await state.batch({ sessions: selection, projectId: 2, todoId: 88 });
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.results, item => item.ok), [true, false, true]);
  assert.deepEqual(Array.from(state.posts, post => [post.recordingId, post.date, post.hours, post.description]), [
    [88, '2026-10-09', '1.00000', 'First note'],
    [88, '2026-10-10', '0.75000', 'Second note'],
    [88, '2026-10-11', '0.25000', 'Third note'],
  ]);
  assert.equal(state.current('a').basecamp.entryId, 42);
  assert.equal(state.current('b').basecamp.entryId, undefined);
  assert.equal(state.current('b').basecamp.synced, false);
  assert.equal(state.current('c').basecamp.entryId, 44);
  assert.equal([state.current('a'), state.current('b'), state.current('c')].filter(s => s.basecamp.entryId).length, 2);
  assert.deepEqual(Array.from(state.progress, item => item.completed), [1, 2, 3]);
  const retry = await state.batch({ sessions: [selection[1]], projectId: 2, todoId: 88 });
  assert.equal(retry.results[0].ok, true);
  assert.equal(state.posts.length, 4);
  assert.equal(state.current('b').basecamp.entryId, 45);
  assert.deepEqual([state.current('a').basecamp.entryId, state.current('b').basecamp.entryId, state.current('c').basecamp.entryId], [42, 45, 44]);
  const duplicate = await state.batch({ sessions: [selection[0]], projectId: 2, todoId: 88 });
  assert.equal(duplicate.ok, false);
  assert.equal(state.posts.length, 4);
});

test('legacy synced time without an entry id cannot silently duplicate in a batch', async () => {
  const state = setup({ sessions: [{ id: 'legacy', taskLabel: 'Old work', duration: 600,
    basecamp: { projectId: 2, todoId: 88, synced: true } }] });
  const selection = [{ sessionId: 'legacy', date: '2026-10-09' }];
  assert.equal((await state.batch({ sessions: selection, projectId: 2, todoId: 88 })).ok, false);
  assert.equal((await state.handler({}, { ...selection[0], projectId: 2, todoId: 88, notes: '', duration: 600 })).ok, false);
  assert.equal(state.posts.length, 0);
  assert.equal((await state.handler({}, { ...selection[0], projectId: 2, todoId: 88, notes: '', duration: 600, allowPossibleDuplicate: true })).ok, true);
  assert.equal(state.posts.length, 1);
});

test('failed to-do remap retains the original Basecamp entry id for retry', async () => {
  const state = setup({ failDelete: true, sessions: [{ id: 's1', taskLabel: 'Work', duration: 600,
    basecamp: { accountId: 1, projectId: 2, todoId: 77, entryId: 42, synced: true } }] });
  const result = await state.handler({}, { sessionId: 's1', date: '2026-10-09', projectId: 2, todoId: 88,
    notes: 'Updated work', duration: 600 });
  assert.equal(result.ok, false);
  assert.equal(state.current().basecamp.entryId, 42);
  assert.equal(state.current().basecamp.todoId, 77);
  assert.equal(state.current().basecamp.synced, false);
  assert.deepEqual(state.deleted, [42]);
  assert.equal(state.posts.length, 0);
});

test('editing a synced short session keeps its recorded duration in the Basecamp update', async () => {
  const source = fs.readFileSync('dist/main/index.js', 'utf8');
  const start = source.indexOf('electron_1.ipcMain.handle(types_1.IPC.UPDATE_SESSION,');
  const end = source.indexOf('// Manual session add', start);
  assert.ok(start > 0 && end > start);
  let handler;
  let session = { id: 'short', taskLabel: 'Quick work', duration: 61, notes: 'Work',
    basecamp: { projectId: 2, todoId: 88, entryId: 42, synced: true } };
  let posted;
  let failDelete = false;
  vm.runInNewContext(source.slice(start, end), {
    electron_1: { ipcMain: { handle: (_channel, fn) => { handler = fn; } } },
    types_1: { IPC: { UPDATE_SESSION: 'data:update-session' } },
    timeTracker: {
      findSession: () => structuredClone(session),
      updateSession: (_id, _date, updates) => { session = { ...session, ...updates }; },
    },
    basecamp: { oauth: { isConnected: () => true }, api: {
      updateTimesheetEntry: async (_id, fields) => { posted = fields; return { id: 42 }; },
      deleteTimesheetEntry: async () => { if (failDelete) throw new Error('delete failed'); },
    } },
    postingSessionIds: new Set(), pendingTimesheetEntry: null, broadcastToWindows() {}, console,
  });
  const result = await handler({}, { sessionId: 'short', date: '2026-10-09', updates: { duration: 62 } });
  assert.equal(result.basecampSynced, true);
  assert.equal(posted.hours, '0.01722');
  failDelete = true;
  const remap = await handler({}, { sessionId: 'short', date: '2026-10-09', updates: {
    basecamp: { projectId: 2, todoId: 99, synced: false },
  } });
  assert.equal(remap.basecampSynced, false);
  assert.equal(session.basecamp.todoId, 88);
  assert.equal(session.basecamp.entryId, 42);
  assert.equal(session.basecamp.synced, false);
  const unlink = await handler({}, { sessionId: 'short', date: '2026-10-09', updates: { basecamp: null } });
  assert.equal(unlink.basecampSynced, false);
  assert.equal(session.basecamp.entryId, 42);
});

test('project recording ID is taken from an existing project-level entry', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (name === './oauth' && parent?.filename.endsWith('/basecamp/api.js')) return { BC_USER_AGENT: 'test' };
    return originalLoad.call(this, name, parent, isMain);
  };
  let BasecampApi;
  try { ({ BasecampApi } = require('../dist/main/services/basecamp/api.js')); }
  finally { Module._load = originalLoad; }
  const api = new BasecampApi({});
  api.getProjectTimesheet = async () => [
    { parentType: 'Todo', parentId: 10 },
    { parentType: 'Timesheet', parentId: 99 },
  ];
  assert.equal(await api.getProjectTimesheetRecordingId(2), 99);
  api.getProjectTimesheet = async () => [];
  await assert.rejects(api.getProjectTimesheetRecordingId(2), /no project-level entry/);
  api.accountBase = () => 'https://example.test';
  api.requestJson = async () => ({ date: '2026-10-09', hours: '0.5', parent: { id: 88 }, person: { id: 1 } });
  await assert.rejects(api.createTimesheetEntry({ todoId: 88, date: '2026-10-09', hours: '0.5' }), /valid time entry ID/);
});

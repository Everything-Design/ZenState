const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let values = {};
class FakeStore {
  constructor({ defaults }) { values = { ...defaults, ...values }; }
  get(key) { return values[key]; }
  set(key, value) { values[key] = value; }
}
Module._load = function (name, parent, isMain) {
  if (name === 'electron-store') return FakeStore;
  if (name === 'electron') return { app: { getPath: () => '/tmp' } };
  return originalLoad.call(this, name, parent, isMain);
};
const { PersistenceService } = require('../dist/main/services/persistence.js');
Module._load = originalLoad;

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const item = (id, extra = {}) => ({ todoId: id, projectId: 1, todoListId: 2, accountId: 3, content: `Task ${id}`, projectName: 'Project', ...extra });

test('default rollover merges unfinished Today and Tomorrow while retaining folders', () => {
  values = {};
  const store = new PersistenceService();
  store.saveTodayPlan({ date: day(-1), items: [item(1, { folderId: 'folder' }), item(2, { completedAt: new Date().toISOString() })], userFolders: [{ id: 'folder', name: 'Work', createdAt: '' }], collapsedFolders: { folder: true } });
  store.saveTomorrowPlan({ date: day(0), items: [item(3)] });
  assert.deepEqual(store.getTodayPlan().items.map((i) => i.todoId), [1, 3]);
  assert.equal(store.getTodayPlan().items[0].folderId, 'folder');
  assert.equal(store.getTodayPlan().collapsedFolders.folder, true);
  assert.equal(store.getTomorrowPlan().items.length, 0);
});

test('separate rollover holds due items for explicit move or reschedule', () => {
  values = {};
  const store = new PersistenceService();
  store.saveSettings({ ...store.getSettings(), separatePlans: true });
  store.saveTodayPlan({ date: day(-1), items: [item(1, { folderId: 'folder' })], userFolders: [{ id: 'folder', name: 'Work', createdAt: '' }] });
  store.saveTomorrowPlan({ date: day(0), items: [item(3)] });
  assert.deepEqual(store.getTodayPlan().items.map((i) => i.todoId), [1]);
  assert.deepEqual(store.getPlanReview().map(({ item }) => item.todoId), [3]);
  store.movePlanReview(3, day(0), 'tomorrow');
  assert.equal(store.getPlanReview().length, 0);
  assert.deepEqual(store.getTomorrowPlan().items.map((i) => i.todoId), [3]);
  assert.equal(store.getTodayPlan().userFolders[0].id, 'folder');
});

test('switching to separate mode preserves an existing future queue', () => {
  values = {};
  const store = new PersistenceService();
  store.saveTodayPlan({ date: day(0), items: [item(1)] });
  store.saveTomorrowPlan({ date: day(1), items: [item(4)] });
  store.saveSettings({ ...store.getSettings(), separatePlans: true });
  assert.equal(store.getTomorrowPlan().items[0].todoId, 4);
  assert.equal(store.getPlanReview().length, 0);
});

test('a future Tomorrow queue is not promoted before midnight in default mode', () => {
  values = {};
  const store = new PersistenceService();
  store.saveTodayPlan({ date: day(-1), items: [item(1)] });
  store.saveTomorrowPlan({ date: day(1), items: [item(5)] });
  assert.deepEqual(store.getTodayPlan().items.map((i) => i.todoId), [1]);
  assert.deepEqual(store.getTomorrowPlan().items.map((i) => i.todoId), [5]);
});

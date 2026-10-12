import React, { useEffect, useState } from 'react';
import { BasecampAuthState, BasecampProject, DailyRecord, DailySession, PinnedTodo, RecentTodo, sessionNeedsBasecampReview } from '../../shared/types';
import { PinPicker } from '../views/dashboard/TodayTab';
import { formatHMS } from '../utils/format';

interface PendingSession { session: DailySession; date: string }

export default function UnpostedTimeReview({ records, onRefresh }: { records: DailyRecord[]; onRefresh: () => void }) {
  const pending: PendingSession[] = records.flatMap((record) => record.sessions
    .filter(sessionNeedsBasecampReview)
    .map((session) => ({ session, date: record.date.split('T')[0] })));
  const [auth, setAuth] = useState<BasecampAuthState | null>(null);
  const [projects, setProjects] = useState<BasecampProject[]>([]);
  const [projectLoadError, setProjectLoadError] = useState('');
  const [recents, setRecents] = useState<RecentTodo[]>([]);
  const [selected, setSelected] = useState<PendingSession | null>(null);
  const [todo, setTodo] = useState<PinnedTodo | null>(null);
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [durationEdited, setDurationEdited] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkTodo, setBulkTodo] = useState<PinnedTodo | null>(null);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');

  useEffect(() => {
    window.zenstate.bcGetAuthState().then(setAuth).catch(() => {});
    window.zenstate.bcListProjects().then((result) => {
      if (result.ok) setProjects(result.data ?? []);
      else setProjectLoadError(result.error ?? 'Could not load Basecamp projects.');
    }).catch(() => setProjectLoadError('Could not load Basecamp projects.'));
    window.zenstate.recentsGet().then(setRecents).catch(() => {});
  }, []);

  function open(entry: PendingSession) {
    setSelected(entry);
    setTodo(entry.session.basecamp?.todoId ? {
      todoId: entry.session.basecamp.todoId,
      projectId: entry.session.basecamp.projectId,
      accountId: entry.session.basecamp.accountId,
      todoListId: entry.session.basecamp.todoListId ?? 0,
      content: recents.find((recent) => recent.todoId === entry.session.basecamp?.todoId
        && recent.projectId === entry.session.basecamp?.projectId)?.content ?? `To-do #${entry.session.basecamp.todoId}`,
      projectName: entry.session.basecamp.projectName
        ?? projects.find((project) => project.id === entry.session.basecamp?.projectId)?.name
        ?? `Project #${entry.session.basecamp.projectId}`,
    } : null);
    setNotes(entry.session.notes ?? '');
    setHours(Math.floor(entry.session.duration / 3600));
    setMinutes(Math.floor((entry.session.duration % 3600) / 60));
    setDurationEdited(false);
    setDuplicateChecked(false);
    setError('');
  }

  async function post() {
    if (!selected || busy) return;
    const duration = durationEdited ? hours * 3600 + minutes * 60 : selected.session.duration;
    if (!todo || !Number.isFinite(duration) || duration <= 0) { setError('Choose a to-do and a positive duration.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await window.zenstate.reconcileSession({
        sessionId: selected.session.id, date: selected.date,
        projectId: todo.projectId, todoId: todo.todoId, notes, duration,
        allowPossibleDuplicate: duplicateChecked,
      });
      if (!result.ok || !result.entryId) throw new Error(result.error ?? 'Basecamp did not confirm the entry.');
      setSelected(null);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
      onRefresh();
    } finally { setBusy(false); }
  }

  const batchable = pending.filter(({ session }) => !session.basecamp?.entryId && !session.basecamp?.synced);
  const batch = batchable.filter(({ session }) => checked.has(session.id));
  const bulkProject = projects.find((item) => item.id === bulkTodo?.projectId);

  async function postBatch() {
    if (!bulkTodo || !batch.length || bulkBusy) return;
    setBulkBusy(true);
    setError('');
    setBulkProgress(`0 of ${batch.length} synced`);
    try {
      const result = await window.zenstate.reconcileBatch({
        sessions: batch.map(({ session, date }) => ({ sessionId: session.id, date })),
        projectId: bulkTodo.projectId, todoId: bulkTodo.todoId,
      });
      if (!result.ok || !result.results) throw new Error(result.error ?? 'Basecamp batch failed.');
      const failures = result.results.filter((item) => !item.ok);
      const synced = result.results.length - failures.length;
      setChecked(new Set(failures.map((item) => item.sessionId)));
      setBulkNotice(`${synced} synced to Basecamp as separate entries. ${failures.length} still need attention.${failures.length ? ` ${failures.map((item) => item.error).filter(Boolean).join(' · ')}` : ''}`);
      setBulkPreview(false);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
      onRefresh();
    } finally { setBulkBusy(false); }
  }

  useEffect(() => window.zenstate.on('data:reconcile-batch-progress', (value) => {
    const progress = value as { completed: number; total: number };
    setBulkProgress(`${progress.completed} of ${progress.total} processed`);
  }), []);

  if (pending.length === 0) return null;
  const project = projects.find((item) => item.id === todo?.projectId);
  return (
    <section style={{ padding: 16, border: '1px solid var(--status-occupied)', borderRadius: 8, marginBottom: 20 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Time to sync with Basecamp · {pending.length}</h2>
      <p style={{ fontSize: 12, color: 'var(--zen-secondary-text)', margin: '0 0 12px' }}>
        Select several sessions to sync them to one to-do as separate time entries, or review one at a time. Unsuccessful sessions stay here for retry.
      </p>
      {bulkNotice && <p role="status" style={{ fontSize: 12, color: 'var(--zen-secondary-text)' }}>{bulkNotice}</p>}
      {batchable.length > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" disabled={bulkBusy} checked={batchable.every(({ session }) => checked.has(session.id))}
            onChange={(e) => setChecked(e.target.checked ? new Set(batchable.map(({ session }) => session.id)) : new Set())} />
          Select all eligible
        </label>
        {batch.length > 0 && <>
          <span>{batch.length} selected · {formatHMS(batch.reduce((total, { session }) => total + session.duration, 0))}</span>
          <button className="btn btn-secondary" disabled={bulkBusy || batch.length > 100} onClick={() => { setError(''); setBulkPreview(true); }}>Review & sync</button>
        </>}
      </div>}
      {batch.length > 100 && <small role="alert" style={{ color: 'var(--status-occupied)' }}>Select up to 100 sessions at a time.</small>}
      {pending.map((entry) => (
        <div key={entry.session.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--zen-divider)' }}>
          {!entry.session.basecamp?.entryId && !entry.session.basecamp?.synced && <input type="checkbox" aria-label={`Select ${entry.session.taskLabel} on ${entry.date}`}
            disabled={bulkBusy} checked={checked.has(entry.session.id)}
            onChange={(e) => setChecked((old) => { const next = new Set(old); e.target.checked ? next.add(entry.session.id) : next.delete(entry.session.id); return next; })} />}
          <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            <strong>{entry.session.taskLabel}</strong> · {entry.date} · {(entry.session.duration / 60).toFixed(1)} min
            <small style={{ display: 'block', color: 'var(--zen-secondary-text)' }}>
              {entry.session.basecamp?.todoId
                ? `Mapped to ${entry.session.basecamp.projectName || `project #${entry.session.basecamp.projectId}`} / to-do #${entry.session.basecamp.todoId}`
                : 'Choose a Basecamp to-do'}
            </small>
            {entry.session.basecamp?.synced && <small style={{ display: 'block', color: 'var(--status-occupied)' }}>Previously marked synced. Check Basecamp before posting to avoid a duplicate. Review separately.</small>}
            {entry.session.notes && <small style={{ display: 'block', color: 'var(--zen-secondary-text)' }}>{entry.session.notes}</small>}
          </div>
          <button className="btn btn-secondary" disabled={bulkBusy} onClick={() => open(entry)}>
            {entry.session.basecamp?.todoId ? 'Sync Basecamp' : 'Choose to-do'}
          </button>
        </div>
      ))}
      {bulkPreview && <>
        <div className="modal-overlay" onClick={() => { if (!bulkBusy) setBulkPreview(false); }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-label="Review batch time sync"
            onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxHeight: '80vh', overflowY: 'auto' }}>
            <strong style={{ fontSize: 15 }}>Sync {batch.length} separate time entries</strong>
            <span style={{ fontSize: 11, color: 'var(--zen-secondary-text)' }}>Each session keeps its own date, duration, and note in Basecamp.</span>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {batch.map(({ session, date }) => <div key={session.id} style={{ padding: '6px 0', borderTop: '1px solid var(--zen-divider)', fontSize: 12 }}>
                <strong>{session.taskLabel}</strong> · {date} · {formatHMS(session.duration)}
                <div style={{ color: 'var(--zen-secondary-text)', whiteSpace: 'pre-wrap' }}>{session.notes?.trim() || session.taskLabel}</div>
              </div>)}
            </div>
            <div style={{ fontSize: 11 }}>
              <div style={{ marginBottom: 4 }}>Destination · Basecamp to-do</div>
              <button className="btn btn-secondary" disabled={!auth?.isConnected || bulkBusy} onClick={() => setBulkPickerOpen(true)}
                style={{ width: '100%', textAlign: 'left' }}>
                {bulkTodo ? `${bulkTodo.projectName} / ${bulkTodo.content} · Change` : 'Choose a to-do…'}
              </button>
            </div>
            {!auth?.isConnected && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>Reconnect Basecamp in Settings to sync.</span>}
            {bulkProject?.timesheetEnabled === false && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>This project has no enabled timesheet. Choose another to-do.</span>}
            {projectLoadError && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>{projectLoadError}</span>}
            {error && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>{error}</span>}
            {bulkBusy && <span role="status" style={{ fontSize: 11 }}>{bulkProgress}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" disabled={bulkBusy} onClick={() => setBulkPreview(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={bulkBusy || !batch.length || !auth?.isConnected || !bulkTodo || bulkProject?.timesheetEnabled === false}
                onClick={postBatch}>{bulkBusy ? 'Syncing…' : `Sync ${batch.length} separate entries`}</button>
            </div>
          </div>
        </div>
        {bulkPickerOpen && auth?.account && <PinPicker open mode="single" target="today" recents={recents}
          alreadyPinned={new Set()} accountId={auth.account.id} onClose={() => setBulkPickerOpen(false)}
          onPickedItem={(item) => { setBulkTodo(item); setBulkPickerOpen(false); }} title="Choose a to-do for selected time" />}
      </>}
      {selected && (
        <>
        <div className="modal-overlay" onClick={() => { if (!busy) setSelected(null); }}>
        <div className="modal-content" role="dialog" aria-modal="true" aria-label="Sync time to Basecamp"
          onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxHeight: '80vh', overflowY: 'auto' }}>
          <strong style={{ fontSize: 15 }}>Sync {selected.session.taskLabel}</strong>
          <span style={{ fontSize: 11, color: 'var(--zen-secondary-text)' }}>{selected.date} · Map this session to a Basecamp to-do.</span>
          <div>
            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Duration</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="text-input" aria-label="Hours" type="number" min="0" max="16" value={hours}
                onChange={(e) => { setHours(parseInt(e.target.value, 10) || 0); setDurationEdited(true); }}
                onBlur={(e) => setHours(Math.min(16, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                style={{ width: 56, padding: '6px 8px', fontSize: 14, fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
              <span style={{ fontSize: 12, color: 'var(--zen-secondary-text)' }}>h</span>
              <input className="text-input" aria-label="Minutes" type="number" min="0" max="59" value={minutes}
                onChange={(e) => { setMinutes(parseInt(e.target.value, 10) || 0); setDurationEdited(true); }}
                onBlur={(e) => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                style={{ width: 56, padding: '6px 8px', fontSize: 14, fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
              <span style={{ fontSize: 12, color: 'var(--zen-secondary-text)' }}>m</span>
            </div>
            {!durationEdited && selected.session.duration % 60 !== 0 &&
              <small style={{ color: 'var(--zen-tertiary-text)' }}>Recorded duration: {formatHMS(selected.session.duration)}. Exact seconds will sync unless you change the duration.</small>}
          </div>
          <label style={{ fontSize: 11 }}>Note
            <textarea className="text-input" value={notes} onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }} rows={2} />
          </label>
          <div style={{ fontSize: 11 }}>
            <div style={{ marginBottom: 4 }}>Destination · Basecamp to-do</div>
            <button className="btn btn-secondary" disabled={!auth?.isConnected}
              onClick={() => setPickerOpen(true)} style={{ width: '100%', textAlign: 'left' }}>
              {todo ? `${todo.projectName} / ${todo.content} · Change` : 'Choose a to-do…'}
            </button>
          </div>
          {!auth?.isConnected && <span style={{ color: 'var(--status-occupied)', fontSize: 11 }}>Reconnect Basecamp in Settings to post this time.</span>}
          {project?.timesheetEnabled === false && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>This to-do's project has no enabled timesheet. Choose another to-do.</span>}
          {projectLoadError && !todo && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>{projectLoadError}</span>}
          {selected.session.basecamp?.synced && !selected.session.basecamp.entryId && <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={duplicateChecked} onChange={(e) => setDuplicateChecked(e.target.checked)} />
            I checked Basecamp and confirmed this time entry is missing.
          </label>}
          {error && <span role="alert" style={{ color: 'var(--status-occupied)', fontSize: 11 }}>{error}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !auth?.isConnected || !todo || project?.timesheetEnabled === false || !!(selected.session.basecamp?.synced && !selected.session.basecamp.entryId && !duplicateChecked)} onClick={post}>
              {busy ? 'Syncing…' : 'Save & sync Basecamp'}
            </button>
          </div>
        </div>
        </div>
          {pickerOpen && auth?.account && <PinPicker open mode="single" target="today" recents={recents}
            alreadyPinned={new Set()} accountId={auth.account.id} onClose={() => setPickerOpen(false)}
            onPickedItem={(item) => { setTodo(item); setPickerOpen(false); }} title="Choose a to-do for this time" />}
        </>
      )}
    </section>
  );
}

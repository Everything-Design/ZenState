import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Clock, RefreshCw, X, Star } from 'lucide-react';
import { BasecampTimesheetEntry, BasecampPerson, BasecampProject, AppSettings } from '../../../shared/types';

// v5.8.0 — Team time tracking tab.
// v5.8.1 — Account-wide scope: picker sources from /people/active.json (all
// teammates in the BC account, not just ones who logged on a pinned project);
// per-person entries are gathered by iterating every accessible BC project
// the authenticated user can see. BC has no person-scoped timesheet endpoint,
// so per-project fan-out is the only way to answer "what's so-and-so been
// working on across the company?"
//
// Data flow:
//   1. On mount: parallel-fetch /people/active.json + /projects.json so the
//      person picker is populated immediately and we know the project set
//      we'll iterate when a person is picked.
//   2. On person select: parallel-fetch /projects/{id}/timesheet.json for
//      every project in the list. Concatenate, dedupe by entry.id (defends
//      against any pagination overlap from BC's API), filter to the
//      selected personId, sort most-recent first.
//
// BC docs: github.com/basecamp/bc3-api
//   - /people/active.json (account-wide active people, paginated)
//   - /projects.json (account-wide projects, paginated)
//   - /projects/{id}/timesheet.json (per-project entries, paginated)

type PeriodKey = 'today' | 'week' | 'month' | 'all';

interface EntryWithProject extends BasecampTimesheetEntry {
  projectId: number;
  projectName: string;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeekStr(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthPrefix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHours(h: string | number): string {
  const n = typeof h === 'string' ? parseFloat(h) : h;
  if (!Number.isFinite(n)) return '0h';
  if (n < 1) return `${Math.round(n * 60)}m`;
  const whole = Math.floor(n);
  const rem = Math.round((n - whole) * 60);
  return rem ? `${whole}h ${rem}m` : `${whole}h`;
}

export default function TeamTimeTab() {
  const [people, setPeople] = useState<BasecampPerson[]>([]);
  const [projects, setProjects] = useState<BasecampProject[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState<boolean>(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('week');
  // v5.8.0 — Favorites: pinned teammates for one-click selection. Sourced
  // from AppSettings.teamTimeFavoritePeopleIds so it survives across launches.
  // Subscribe to settings:updated so toggling stays in sync if multiple
  // dashboard windows are ever open.
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  useEffect(() => {
    window.zenstate.getSettings()
      .then((s) => setFavoriteIds(((s as AppSettings)?.teamTimeFavoritePeopleIds) ?? []))
      .catch(() => { /* default = no favorites */ });
    return window.zenstate.on('settings:updated', (...args: unknown[]) => {
      const next = args[0] as AppSettings | undefined;
      setFavoriteIds(next?.teamTimeFavoritePeopleIds ?? []);
    });
  }, []);
  const toggleFavorite = useCallback(async (personId: number) => {
    try {
      const current = await window.zenstate.getSettings();
      const settings = current as AppSettings;
      const existing = settings.teamTimeFavoritePeopleIds ?? [];
      const next = existing.includes(personId)
        ? existing.filter((id) => id !== personId)
        : [...existing, personId];
      await window.zenstate.saveSettings({ ...settings, teamTimeFavoritePeopleIds: next });
      setFavoriteIds(next); // optimistic; settings:updated broadcast confirms
    } catch (err) {
      console.warn('[TeamTimeTab] toggleFavorite failed:', err);
    }
  }, []);

  const [entriesByPerson, setEntriesByPerson] = useState<Map<number, EntryWithProject[]>>(new Map());
  const [entriesLoading, setEntriesLoading] = useState<boolean>(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entriesProgress, setEntriesProgress] = useState<{ done: number; total: number } | null>(null);

  // Bootstrap on mount: parallel-fetch the account-wide people + project lists.
  // These are the two sources for the picker; cached for the session so a
  // person-switch doesn't re-fetch them.
  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    setBootstrapError(null);
    const zs = window.zenstate as unknown as {
      bcListPeople: () => Promise<{ ok: boolean; data?: BasecampPerson[]; error?: string }>;
      bcListProjects: () => Promise<{ ok: boolean; data?: BasecampProject[]; error?: string }>;
    };
    Promise.all([zs.bcListPeople(), zs.bcListProjects()])
      .then(([peopleRes, projectsRes]) => {
        if (cancelled) return;
        if (!peopleRes.ok) { setBootstrapError(peopleRes.error ?? 'Failed to load people'); return; }
        if (!projectsRes.ok) { setBootstrapError(projectsRes.error ?? 'Failed to load projects'); return; }
        const activePeople = (peopleRes.data ?? [])
          .filter((p) => !p.client) // exclude clients — they don't show on team timesheets
          .sort((a, b) => a.name.localeCompare(b.name));
        setPeople(activePeople);
        setProjects(projectsRes.data ?? []);
      })
      .catch((e) => { if (!cancelled) setBootstrapError((e as Error)?.message ?? 'Bootstrap failed'); })
      .finally(() => { if (!cancelled) setBootstrapLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Auto-pick the first person on bootstrap so the user sees data immediately.
  useEffect(() => {
    if (selectedPersonId === null && people.length > 0) {
      setSelectedPersonId(people[0].id);
    }
  }, [selectedPersonId, people]);

  // Fetch entries for the selected person: iterate every accessible project,
  // gather entries authored by that personId. Cached per personId so flipping
  // between people in the same session doesn't re-iterate. Manual refresh
  // (via the Refresh button) clears the cache.
  const fetchEntriesForPerson = useCallback(async (personId: number, forceRefresh = false) => {
    if (!forceRefresh && entriesByPerson.has(personId)) return;
    if (projects.length === 0) return;
    setEntriesLoading(true);
    setEntriesError(null);
    setEntriesProgress({ done: 0, total: projects.length });
    try {
      const zs = window.zenstate as unknown as {
        bcGetProjectTimesheet: (projectId: number) => Promise<{ ok: boolean; data?: BasecampTimesheetEntry[]; error?: string }>;
      };
      let done = 0;
      const projectResults = await Promise.all(projects.map(async (proj) => {
        const res = await zs.bcGetProjectTimesheet(proj.id);
        done++;
        setEntriesProgress({ done, total: projects.length });
        if (!res.ok || !res.data) return [] as EntryWithProject[];
        // Filter to this person up-front so we never carry around irrelevant
        // entries (a single BC account can have thousands).
        return res.data
          .filter((e) => e.personId === personId)
          .map((e) => ({ ...e, projectId: proj.id, projectName: proj.name }));
      }));
      // Dedupe by entry.id — defends against any pagination overlap from BC's
      // API where the same entry could appear on multiple pages.
      const seen = new Set<number>();
      const merged: EntryWithProject[] = [];
      for (const e of projectResults.flat()) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        merged.push(e);
      }
      setEntriesByPerson((prev) => {
        const next = new Map(prev);
        next.set(personId, merged);
        return next;
      });
    } catch (e) {
      setEntriesError((e as Error)?.message ?? 'Failed to load entries');
    } finally {
      setEntriesLoading(false);
      setEntriesProgress(null);
    }
  }, [projects, entriesByPerson]);

  // Trigger fetch when the selected person changes (and projects are loaded).
  useEffect(() => {
    if (selectedPersonId !== null && projects.length > 0) {
      void fetchEntriesForPerson(selectedPersonId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId, projects.length]);

  // Refresh = drop the cache + re-fetch for the current person.
  const handleRefresh = useCallback(() => {
    if (selectedPersonId === null) return;
    void fetchEntriesForPerson(selectedPersonId, true);
  }, [selectedPersonId, fetchEntriesForPerson]);

  // Entries filtered to active period, sorted most-recent first. Same-date
  // entries fall back to descending BC id order (BC entries don't carry a
  // wall-clock timestamp finer than `date`).
  const personEntries = useMemo(() => {
    if (selectedPersonId === null) return [] as EntryWithProject[];
    const all = entriesByPerson.get(selectedPersonId) ?? [];
    let filtered = all;
    if (period === 'today') {
      const today = todayDateStr();
      filtered = filtered.filter((e) => e.date === today);
    } else if (period === 'week') {
      const ws = startOfWeekStr();
      filtered = filtered.filter((e) => e.date >= ws);
    } else if (period === 'month') {
      const mp = monthPrefix();
      filtered = filtered.filter((e) => e.date.startsWith(mp));
    }
    return [...filtered].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [entriesByPerson, selectedPersonId, period]);

  const totalHours = useMemo(
    () => personEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0),
    [personEntries],
  );

  const selectedPerson = people.find((p) => p.id === selectedPersonId);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Team time</h1>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-secondary"
          onClick={handleRefresh}
          disabled={entriesLoading || selectedPersonId === null}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          title="Re-fetch this person's entries across all accessible projects"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {bootstrapLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--zen-tertiary-text)', fontSize: 13 }}>
          Loading team + project list from Basecamp…
        </div>
      ) : bootstrapError ? (
        <div className="card" style={{ padding: 12, color: 'var(--zen-text)', fontSize: 12, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)' }}>
          Couldn&rsquo;t load team data: {bootstrapError}
        </div>
      ) : people.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--zen-tertiary-text)', fontSize: 13, lineHeight: 1.6 }}>
          <Clock size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: 'var(--zen-secondary-text)', marginBottom: 6 }}>No teammates found</div>
          <div>Basecamp returned no active people on your account. If this looks wrong, check the connection in Settings.</div>
        </div>
      ) : (
        <>
          {/* Person picker + period filter */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className="card-title" style={{ margin: 0 }}>Who</span>
              <div className="spacer" />
              <select
                value={selectedPersonId ?? ''}
                onChange={(e) => setSelectedPersonId(e.target.value ? Number(e.target.value) : null)}
                style={{
                  background: 'var(--zen-tertiary-bg)',
                  border: '1px solid var(--zen-divider)',
                  borderRadius: 6,
                  color: 'var(--zen-text)',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  padding: '6px 10px',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: 220,
                }}
                aria-label="Pick a teammate"
              >
                <option value="">Pick a teammate…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</option>
                ))}
              </select>
            </div>
            {/* v5.8.0 — Favorites quick-select row. Only renders when there's
                at least one favorited person. Click a pill to immediately
                jump to that person's entries; click the × to remove. */}
            {favoriteIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Favorites
                </span>
                {favoriteIds.map((id) => {
                  const person = people.find((p) => p.id === id);
                  if (!person) return null;
                  const isSelected = selectedPersonId === id;
                  return (
                    <div
                      key={id}
                      style={{
                        // Border-less box; the "border" is an inset box-shadow
                        // so swapping selected/unselected can't shift layout.
                        // Both states reserve the same 1px ring, just colored
                        // differently — divider for inactive, primary for
                        // active. v5.8.0 — fixes a 1px nudge users saw when
                        // tapping between favorite pills.
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 12,
                        background: isSelected ? 'var(--zen-primary)' : 'var(--zen-tertiary-bg)',
                        boxShadow: `inset 0 0 0 1px ${isSelected ? 'var(--zen-primary)' : 'var(--zen-divider)'}`,
                        color: isSelected ? 'white' : 'var(--zen-text)',
                        fontSize: 12,
                        overflow: 'hidden',
                        transition: 'background 120ms ease, box-shadow 120ms ease, color 120ms ease',
                      }}
                    >
                      <button
                        onClick={() => setSelectedPersonId(id)}
                        title={`Show ${person.name}'s entries`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          padding: '4px 4px 4px 10px',
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {person.name}
                      </button>
                      <button
                        onClick={() => void toggleFavorite(id)}
                        title="Remove from favorites"
                        aria-label={`Remove ${person.name} from favorites`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          opacity: 0.7,
                          padding: '4px 8px 4px 2px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--zen-secondary-text)' }}>Period</span>
              <div className="spacer" />
              {(['today', 'week', 'month', 'all'] as PeriodKey[]).map((p) => (
                <button
                  key={p}
                  className={`category-chip ${period === p ? 'selected' : ''}`}
                  onClick={() => setPeriod(p)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time'}
                </button>
              ))}
            </div>
          </div>

          {/* Entries list */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className="card-title" style={{ margin: 0 }}>
                {selectedPerson ? `${selectedPerson.name}'s entries` : 'Entries'}
              </span>
              {/* v5.8.0 — Star toggle to pin/unpin the current person. Filled
                  star when this person is in favorites; outline when not. */}
              {selectedPerson && (
                <button
                  onClick={() => void toggleFavorite(selectedPerson.id)}
                  title={favoriteIds.includes(selectedPerson.id) ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={favoriteIds.includes(selectedPerson.id) ? 'Remove from favorites' : 'Add to favorites'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: favoriteIds.includes(selectedPerson.id) ? '#fbbf24' : 'var(--zen-tertiary-text)',
                    padding: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 4,
                  }}
                >
                  <Star size={14} fill={favoriteIds.includes(selectedPerson.id) ? 'currentColor' : 'none'} />
                </button>
              )}
              <div className="spacer" />
              {selectedPerson && !entriesLoading && personEntries.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--zen-secondary-text)' }}>
                  {personEntries.length} {personEntries.length === 1 ? 'entry' : 'entries'} · {formatHours(totalHours)} total
                </span>
              )}
            </div>

            {entriesLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--zen-tertiary-text)', fontSize: 12 }}>
                {entriesProgress
                  ? `Scanning ${entriesProgress.done} / ${entriesProgress.total} projects…`
                  : 'Loading entries…'}
              </div>
            ) : entriesError ? (
              <div style={{ padding: 12, borderRadius: 6, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)', color: 'var(--zen-text)', fontSize: 12 }}>
                Couldn&rsquo;t load entries: {entriesError}
              </div>
            ) : selectedPersonId === null ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--zen-tertiary-text)', fontSize: 12 }}>
                Pick a teammate above to see their recent entries.
              </div>
            ) : personEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--zen-tertiary-text)', fontSize: 12, lineHeight: 1.6 }}>
                No entries for {selectedPerson?.name ?? 'this person'} in the selected period across {projects.length} {projects.length === 1 ? 'project' : 'projects'}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {personEntries.map((entry) => (
                  <div key={entry.id} className="session-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Top line: project + to-do together so both are
                          visible at a glance. Project is shown with normal
                          weight + tertiary color (the "where"); to-do is
                          bold + primary color (the "what"). Bullet separator
                          keeps it scannable. v5.8.0 — user feedback: surface
                          the to-do name alongside the project name. */}
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--zen-secondary-text)', fontWeight: 400 }}>
                          {entry.projectName}
                        </span>
                        <span style={{ color: 'var(--zen-tertiary-text)', margin: '0 6px' }}>·</span>
                        <span style={{ color: 'var(--zen-text)', fontWeight: 600 }}>
                          {entry.parentTitle ?? `Recording #${entry.parentId}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', marginTop: 2 }}>
                        {formatDate(entry.date)}
                      </div>
                      {entry.description && (
                        <div style={{ fontSize: 11, color: 'var(--zen-secondary-text)', marginTop: 4, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {entry.description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--zen-text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {formatHours(entry.hours)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

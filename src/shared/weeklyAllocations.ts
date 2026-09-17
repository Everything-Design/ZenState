export interface WeeklyAllocations {
  schemaVersion: 1;
  projectScope: 'billable';
  basecampAccountId: string;
  basecampPersonId: string;
  week: { startDate: string; endDate: string; timezone: 'Asia/Kolkata' };
  generatedAt: string;
  planningRevision: number;
  planningUpdatedAt: string | null;
  basecampSync: {
    lastSuccessfulAt: string | null;
    importedFrom: string;
    importedThrough: string;
    recordedFrom: string | null;
    recordedThrough: string | null;
    latestAttemptStatus: 'failed' | 'succeeded' | 'unknown';
    latestAttemptAt: string | null;
    freshness: 'fresh' | 'stale' | 'unknown';
    staleAfterSeconds: number;
    weekCoverage: 'unavailable' | 'partial' | 'week_to_date' | 'full_week';
    accessCoverage: 'unverified';
  };
  projects: {
    basecampProjectId: string;
    projectName: string;
    allocationStatus: 'none' | 'explicit_zero' | 'allocated' | 'released';
    displayGroup: 'allocated' | 'other_recorded';
    context: string[];
    plannedHours: number | null;
    recordedHours: number | null;
    remainingHours: number | null;
    allocationUpdatedAt: string | null;
    balanceStatus: 'unavailable' | 'provisional';
    reasons: string[];
  }[];
}
export type WeeklyAllocationResult = { ok: true; data: WeeklyAllocations } | { ok: false; error: string };

export function allocationProgress(planned: number | null, recorded: number | null) {
  if (planned === null || recorded === null || recorded <= 0) return null;
  const difference = Math.round(recorded * 100) - Math.round(planned * 100);
  return difference > 0 ? 'over' : difference === 0 ? 'matched' : 'within';
}

export function allocationWeekLabel(start: string) {
  const format = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return format.formatRange(new Date(`${start}T00:00:00Z`), new Date(`${shiftAllocationDate(start, 6)}T00:00:00Z`));
}

export function shiftAllocationDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function currentAllocationWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return shiftAllocationDate(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
}
export function validAllocationWeek(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed.getUTCDay() === 1;
}

export function parseWeeklyAllocations(value: unknown, accountId: string, week: string): WeeklyAllocations {
  const d = value as WeeklyAllocations;
  const date = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const stamp = (s: unknown) => s === null || (typeof s === 'string' && Number.isFinite(Date.parse(s)));
  const hours = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n));
  if (!d || d.schemaVersion !== 1 || d.projectScope !== 'billable' || d.basecampAccountId !== accountId || !/^[1-9]\d*$/.test(d.basecampPersonId)
    || d.week?.startDate !== week || d.week.endDate !== shiftAllocationDate(week, 6) || d.week.timezone !== 'Asia/Kolkata'
    || !stamp(d.generatedAt) || !d.generatedAt || !stamp(d.planningUpdatedAt) || !Number.isSafeInteger(d.planningRevision)
    || !d.basecampSync || !Array.isArray(d.projects) || d.projects.length > 5000) throw new Error('Invalid weekly planning response.');
  const s = d.basecampSync;
  if (!stamp(s.lastSuccessfulAt) || !stamp(s.latestAttemptAt) || !date(s.importedFrom) || !date(s.importedThrough)
    || !(s.recordedFrom === null || date(s.recordedFrom)) || !(s.recordedThrough === null || date(s.recordedThrough))
    || !['failed', 'succeeded', 'unknown'].includes(s.latestAttemptStatus) || !['fresh', 'stale', 'unknown'].includes(s.freshness)
    || !['unavailable', 'partial', 'week_to_date', 'full_week'].includes(s.weekCoverage) || s.accessCoverage !== 'unverified'
    || !Number.isFinite(s.staleAfterSeconds) || s.staleAfterSeconds <= 0) throw new Error('Invalid weekly planning response.');
  const ids = new Set<string>();
  const projects = d.projects.map(p => {
    if (!p || !/^[1-9]\d*$/.test(p.basecampProjectId) || ids.has(p.basecampProjectId) || typeof p.projectName !== 'string'
      || !['none', 'explicit_zero', 'allocated', 'released'].includes(p.allocationStatus)
      || !['allocated', 'other_recorded'].includes(p.displayGroup) || !Array.isArray(p.context)
      || p.context.some(c => !['no_weekly_allocation', 'not_project_member', 'on_hold_project', 'inactive_project', 'project_status_unverified'].includes(c))
      || !hours(p.plannedHours) || !hours(p.recordedHours) || !hours(p.remainingHours)
      || (p.plannedHours !== null && p.plannedHours < 0) || (p.recordedHours !== null && p.recordedHours < 0)
      || !stamp(p.allocationUpdatedAt) || !['unavailable', 'provisional'].includes(p.balanceStatus)
      || !Array.isArray(p.reasons) || p.reasons.some(r => typeof r !== 'string')
      || (p.allocationStatus === 'none' && (p.plannedHours !== null || p.remainingHours !== null))) throw new Error('Invalid weekly planning response.');
    ids.add(p.basecampProjectId);
    return { basecampProjectId: p.basecampProjectId, projectName: p.projectName, allocationStatus: p.allocationStatus, displayGroup: p.displayGroup, context: [...p.context], plannedHours: p.plannedHours, recordedHours: p.recordedHours, remainingHours: p.remainingHours, allocationUpdatedAt: p.allocationUpdatedAt, balanceStatus: p.balanceStatus, reasons: [...p.reasons] };
  });
  // A second allowlist at the desktop boundary prevents accidental upstream fields reaching the renderer.
  return { schemaVersion: 1, projectScope: 'billable', basecampAccountId: d.basecampAccountId, basecampPersonId: d.basecampPersonId,
    week: { startDate: d.week.startDate, endDate: d.week.endDate, timezone: d.week.timezone }, generatedAt: d.generatedAt,
    planningRevision: d.planningRevision, planningUpdatedAt: d.planningUpdatedAt,
    basecampSync: { lastSuccessfulAt: s.lastSuccessfulAt, importedFrom: s.importedFrom, importedThrough: s.importedThrough,
      recordedFrom: s.recordedFrom, recordedThrough: s.recordedThrough, latestAttemptStatus: s.latestAttemptStatus,
      latestAttemptAt: s.latestAttemptAt, freshness: s.freshness, staleAfterSeconds: s.staleAfterSeconds,
      weekCoverage: s.weekCoverage, accessCoverage: s.accessCoverage }, projects };
}

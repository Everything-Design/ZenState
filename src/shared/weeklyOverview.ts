import { parseWeeklyAllocations, shiftAllocationDate, WeeklyAllocations } from './weeklyAllocations';

export interface WeeklyOverview extends Omit<WeeklyAllocations, 'projectScope' | 'projects'> {
  projectScope: 'personal';
  canonicalPersonId: string;
  historicalPlan: boolean;
  onBreak: boolean;
  projects: (WeeklyAllocations['projects'][number] & {
    category: 'billable' | 'growth'; status: string; expectedEnd: string | null;
    progress: { percent: number; date: string } | null;
  })[];
  totals: { category: 'billable' | 'growth'; plannedHours: number; loggedHours: number | null; targetHours: number | null }[];
  capacity: { weekStart: string; availableHours: number; plannedHours: number; tentativeHours: number; freeHours: number; overallocatedHours: number }[];
  leave: { date: string; hours: number; kind: 'leave' | 'break'; half: 'first' | 'second' | null; plannedHours: number; conflict: boolean }[];
  needsYou: { id: string; kind: 'request' | 'progress' | 'planning' | 'time_review'; text: string; date: string }[];
  needsYouAsOf: string;
}
export type WeeklyOverviewResult = { ok: true; data: WeeklyOverview } | { ok: false; error: string };

/** Validate and allowlist again before crossing the IPC boundary. */
export function parseWeeklyOverview(value: unknown, accountId: string, week: string): WeeklyOverview {
  const d = value as WeeklyOverview;
  const fail = (): never => { throw new Error('Invalid weekly overview.'); };
  const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const nullableNumber = (v: unknown) => v === null || number(v);
  if (!d || d.projectScope !== 'personal' || typeof d.canonicalPersonId !== 'string' || !/^[1-9]\d*$/.test(d.canonicalPersonId)
    || typeof d.onBreak !== 'boolean' || typeof d.historicalPlan !== 'boolean' || !day(d.needsYouAsOf)) fail();
  const base = parseWeeklyAllocations({ ...d, projectScope: 'billable' }, accountId, week);
  const projects = base.projects.map((p, i) => {
    const v = d.projects[i];
    if (!['billable', 'growth'].includes(v.category) || !['active', 'inactive', 'on-hold', 'upcoming', 'internal', 'pitch', 'cancelled', 'unknown'].includes(v.status)
      || !(v.expectedEnd === null || day(v.expectedEnd)) || !(v.progress === null || (number(v.progress?.percent) && v.progress.percent <= 100 && day(v.progress.date)))) fail();
    return { ...p, category: v.category, status: v.status, expectedEnd: v.expectedEnd, progress: v.progress ? { percent: v.progress.percent, date: v.progress.date } : null };
  });
  if (!Array.isArray(d.totals) || d.totals.length !== 2 || !Array.isArray(d.capacity) || d.capacity.length !== 2
    || !Array.isArray(d.leave) || d.leave.length > 100 || !Array.isArray(d.needsYou) || d.needsYou.length > 5000) fail();
  const totals = d.totals.map((v, i) => {
    if (v.category !== ['billable', 'growth'][i] || !number(v.plannedHours) || !nullableNumber(v.loggedHours) || !nullableNumber(v.targetHours)) fail();
    return { category: v.category, plannedHours: v.plannedHours, loggedHours: v.loggedHours, targetHours: v.targetHours };
  });
  const capacity = d.capacity.map((v, i) => {
    if (v.weekStart !== shiftAllocationDate(week, i * 7) || ![v.availableHours, v.plannedHours, v.tentativeHours, v.freeHours, v.overallocatedHours].every(number)) fail();
    return { weekStart: v.weekStart, availableHours: v.availableHours, plannedHours: v.plannedHours, tentativeHours: v.tentativeHours, freeHours: v.freeHours, overallocatedHours: v.overallocatedHours };
  });
  const leave = d.leave.map(v => {
    if (!day(v.date) || v.date < week || v.date > shiftAllocationDate(week, 13) || !number(v.hours) || !number(v.plannedHours)
      || !['leave', 'break'].includes(v.kind) || ![null, 'first', 'second'].includes(v.half) || typeof v.conflict !== 'boolean') fail();
    return { date: v.date, hours: v.hours, kind: v.kind, half: v.half, plannedHours: v.plannedHours, conflict: v.conflict };
  });
  const needsYou = d.needsYou.map(v => {
    if (typeof v.id !== 'string' || !['request', 'progress', 'planning', 'time_review'].includes(v.kind) || typeof v.text !== 'string' || v.text.length > 2000 || !day(v.date)) fail();
    return { id: v.id, kind: v.kind, text: v.text, date: v.date };
  });
  return { ...base, projectScope: 'personal', canonicalPersonId: d.canonicalPersonId, projects, totals, capacity, leave, needsYou,
    onBreak: d.onBreak, historicalPlan: d.historicalPlan, needsYouAsOf: d.needsYouAsOf };
}

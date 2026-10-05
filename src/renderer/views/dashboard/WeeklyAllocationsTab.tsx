import React, { useCallback, useEffect, useRef, useState } from 'react';
import { allocationProgress, allocationWeekLabel, currentAllocationWeek, shiftAllocationDate } from '../../../shared/weeklyAllocations';
import type { WeeklyOverview } from '../../../shared/weeklyOverview';
import type { DailyRecord } from '../../../shared/types';
import '../../styles/weekly-allocations.css';

const hours = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}h`;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST' : 'Unknown';
const contextLabel: Record<string, string> = {
  no_weekly_allocation: 'No weekly allocation', not_project_member: 'Not a project member',
  inactive_project: 'Inactive project', on_hold_project: 'Project on hold', project_status_unverified: 'Project status unverified',
};

function AllocationTable({ projects, caption }: { projects: WeeklyOverview['projects']; caption: string }) {
  return <div className="weekly-allocations-table-wrap"><table>
    <caption className="weekly-allocations-caption">{caption}</caption>
    <thead><tr><th scope="col">Project</th><th scope="col">Planned</th><th scope="col">Logged</th><th scope="col">Remaining</th></tr></thead>
    <tbody>{projects.map(project => {
      const progress = allocationProgress(project.plannedHours, project.recordedHours);
      const color = progress ? `weekly-allocations-${progress}` : undefined;
      return <tr key={project.basecampProjectId}>
      <th scope="row"><span className={color}>{project.projectName}</span><small>{project.status} · {project.expectedEnd ? `Expected end ${project.expectedEnd}` : 'No expected end'} · {project.progress ? `${project.progress.percent}% reported ${project.progress.date}` : 'Progress not reported'}</small><small>{project.allocationUpdatedAt ? `Allocation saved ${timestamp(project.allocationUpdatedAt)}` : 'No saved allocation for this week'}{project.allocationStatus === 'released' && ' · Commitment released'}{project.reasons.includes('project_access_unverified') && ' · Project access unverified'}</small>
        {project.context.length > 0 && <small>{project.context.map(value => contextLabel[value]).join(' · ')}</small>}
      </th>
      <td>{project.allocationStatus === 'none' ? 'No allocation' : hours(project.plannedHours)}</td>
      <td className={color}>{hours(project.recordedHours)}</td>
      <td className={color}>{project.remainingHours !== null && project.remainingHours < 0 ? `${hours(-project.remainingHours)} over` : hours(project.remainingHours)}
        {progress && <small className="weekly-allocations-progress-label">{progress === 'over' ? 'Over plan' : progress === 'matched' ? 'Plan matched' : 'Within plan'}</small>}
      </td>
    </tr>; })}</tbody>
  </table></div>;
}

export default function WeeklyAllocationsTab({ records, timerState, onOpenTimesheet }: { records: DailyRecord[]; timerState: { isRunning: boolean; isPaused: boolean; elapsed: number }; onOpenTimesheet: () => void }) {
  const [week, setWeek] = useState(() => currentAllocationWeek());
  const [data, setData] = useState<WeeklyOverview | null>(null);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setLoading(true);
    try {
      const auth = await window.zenstate.bcGetAuthState();
      if (request !== generation.current) return;
      setAccountId(auth.isConnected && auth.account ? String(auth.account.id) : null);
      const result = await window.zenstate.getWeeklyOverview(week);
      if (request !== generation.current) return;
      setNow(Date.now());
      setData(result.ok ? result.data : null);
      setError(result.ok ? '' : result.error);
    } catch {
      if (request !== generation.current) return;
      setData(null);
      setError('Weekly planning is unavailable. Time recording is unaffected.');
    } finally {
      if (request === generation.current) { busy.current = false; setLoading(false); }
    }
  }, [week]);

  useEffect(() => {
    setData(null); setError(''); busy.current = false;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = setInterval(() => { setNow(Date.now()); visible(); }, 60000);
    document.addEventListener('visibilitychange', visible);
    const unsubscribe = window.zenstate.on('basecamp:auth-changed', () => {
      ++generation.current; busy.current = false; setData(null); setAccountId(null); setError(''); void refresh();
    });
    return () => { ++generation.current; busy.current = false; clearInterval(interval); unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);

  const sync = data?.basecampSync;
  const allocated = data?.projects.filter(p => p.displayGroup === 'allocated') ?? [];
  const otherRecorded = data?.projects.filter(p => p.displayGroup === 'other_recorded') ?? [];
  const stale = !!sync && (sync.freshness !== 'fresh' || !sync.lastSuccessfulAt || now - Date.parse(sync.lastSuccessfulAt) > sync.staleAfterSeconds * 1000);
  return <section className="weekly-allocations" aria-labelledby="weekly-allocation-title">
    <div className="weekly-allocations-heading">
      <h2 id="weekly-allocation-title">Your week</h2>
      <button onClick={() => void window.zenstate.openExternal('https://ops.everythingflow.agency')}>Open Ops ↗</button>
      <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="weekly-allocations-navigation" aria-label="Allocation week">
      <button aria-label="Previous allocation week" onClick={() => setWeek(shiftAllocationDate(week, -7))}>←</button>
      <div className="weekly-allocations-week"><strong>{allocationWeekLabel(week)}</strong><span>{week === currentAllocationWeek() ? 'This week' : week < currentAllocationWeek() ? 'Past week' : 'Upcoming week'}</span></div>
      <button aria-label="Next allocation week" onClick={() => setWeek(shiftAllocationDate(week, 7))}>→</button>
      <button disabled={week === currentAllocationWeek()} onClick={() => setWeek(currentAllocationWeek())}>This week</button>
    </div>
    <div className="weekly-allocations-notice weekly-overview-local">
      <div><strong>Local time · separate from Ops</strong><p>{timerState.isRunning || timerState.isPaused ? `Timer ${timerState.isPaused ? 'paused' : 'running'} · ${hours(timerState.elapsed / 3600)}. ` : ''}{records.flatMap(r => r.sessions).filter(session => {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(session.startTime));
        return day >= week && day <= shiftAllocationDate(week, 6) && !session.basecamp?.synced && (!session.basecamp || String(session.basecamp.accountId) === accountId);
      }).length} unposted sessions in this week. Recently posted sessions may be awaiting the next Ops import.</p></div>
      <button onClick={onOpenTimesheet}>Open Timesheet</button>
    </div>
    {error && <div role="alert" className="weekly-allocations-notice">{error}</div>}
    {loading && !data && <p role="status">Loading your week…</p>}
    {data && sync && <>
      <div className="weekly-allocations-sync" role="status">
        <div><strong>Last time update</strong><span>{timestamp(sync.lastSuccessfulAt)}</span></div>
        <span className="weekly-allocations-sync-status">{sync.latestAttemptStatus === 'failed' ? 'Import failed' : stale ? 'Time data outdated' : sync.weekCoverage === 'unavailable' ? 'Time data unavailable' : sync.weekCoverage === 'partial' ? 'Partial time data' : 'Latest imported time'} · Provisional</span>
      </div>
      <div className="weekly-overview-summary">
        {data.totals.map(total => <article key={total.category}>
          <h3>{total.category === 'billable' ? 'Billable' : 'Growth time'}</h3>
          <strong>{hours(total.loggedHours)} <span>logged</span></strong>
          <p>{hours(total.plannedHours)} planned · {total.targetHours === null ? 'Target not set' : `${hours(total.targetHours)} target`}</p>
        </article>)}
      </div>
      <p>Targets account for your working days, leave and holidays.{data.historicalPlan && ' Historical hours use the plan saved before that week began.'}</p>
      <h3 className="weekly-allocations-section-title">Available capacity</h3>
      <div className="weekly-overview-summary">
        {data.capacity.map((capacity, i) => <article key={capacity.weekStart}>
          <h3>{i === 0 ? 'Selected week' : 'Following week'} <small>{allocationWeekLabel(capacity.weekStart)}</small></h3>
          <strong className={capacity.overallocatedHours > 0 ? 'weekly-allocations-over' : undefined}>{capacity.overallocatedHours > 0 ? `${hours(capacity.overallocatedHours)} over-allocated` : `${hours(capacity.freeHours)} free`}</strong>
          <p>{hours(capacity.plannedHours)} committed / {hours(capacity.availableHours)} available{capacity.tentativeHours > 0 && ` · ${hours(capacity.tentativeHours)} tentative`}</p>
        </article>)}
      </div>
      <p>Free capacity is working time without a committed allocation. Remaining project hours below subtract logged time from your allocation.</p>
      <h3 className="weekly-allocations-section-title">My projects</h3>
      {(['billable', 'growth'] as const).map(category => {
        const rows = allocated.filter(p => p.category === category);
        return <div key={category}><h4 className="weekly-allocations-section-title">{category === 'billable' ? 'Billable' : 'Growth time'}</h4>
          {rows.length ? <AllocationTable projects={rows} caption={`${category} projects for ${week}`} /> : <p>No committed projects for this week.</p>}</div>;
      })}
      {otherRecorded.length > 0 && <details key={week} className="weekly-allocations-other">
        <summary>Other logged projects <span>({otherRecorded.length}) · {hours(otherRecorded.reduce((total, project) => total + (project.recordedHours ?? 0), 0))} logged</span></summary>
        <p>Work without a weekly allocation, outside current membership, or on inactive/on-hold projects.</p>
        <AllocationTable projects={otherRecorded} caption={`Other logged projects for ${week}`} />
      </details>}
      <div className="weekly-overview-bottom">
        <section><h3 className="weekly-allocations-section-title">Needs you <small>Current · as of {data.needsYouAsOf}</small></h3>
          {data.needsYou.length ? <ul className="weekly-overview-list">{data.needsYou.map(item => <li key={item.id}><small>{item.kind.replace('_', ' ')} · {item.date}</small>{item.text}{item.kind === 'time_review' && <button onClick={onOpenTimesheet}>Review Timesheet</button>}</li>)}</ul> : <p>No current requests or reminders.</p>}
        </section>
        <section><h3 className="weekly-allocations-section-title">My leave <small>Selected and following week</small></h3>
          {data.onBreak && <p>You are marked as on a break in Ops.</p>}
          {data.leave.length ? <ul className="weekly-overview-list">{data.leave.map((leave, i) => <li key={`${leave.date}-${i}`}>{leave.date} · {leave.kind === 'break' ? 'Break' : 'Leave'} · {leave.half ? `${leave.half} half` : hours(leave.hours)}
            {leave.plannedHours > 0 && <small className={leave.conflict ? 'weekly-allocations-over' : undefined}>{hours(leave.plannedHours)} planned that day{leave.conflict ? ' · exceeds available time; review in Ops' : ''}</small>}</li>)}</ul> : <p>No leave or dated breaks recorded.</p>}
        </section>
      </div>
      <details className="weekly-allocations-info">
        <summary>About these hours &amp; update details</summary>
        <p>Billable and Growth time from Everything Ops. Refreshes every minute while this view is visible. Logged hours include Ops time corrections and exclude entries removed in review. Project status and expected end are current; progress is the latest reported value through the selected week, never calculated from hours.</p>
        <p>Running, unposted and not-yet-imported time is not included. Allocations never limit time recording.</p>
        <p>Green: recorded time below plan. Yellow: plan matched. Red: over plan. Projects with no recorded time or no allocation stay neutral. Colours describe imported time, not project completion.</p>
        <p>{sync.recordedFrom && sync.recordedThrough ? `Recorded dates covered: ${sync.recordedFrom} – ${sync.recordedThrough}.` : 'This week has no imported time coverage.'} {sync.weekCoverage === 'week_to_date' ? 'This week is still in progress.' : sync.weekCoverage === 'partial' ? 'Some dates in this week are missing from the import.' : ''}</p>
        <p>{stale ? 'Time data is stale or its freshness is unknown. ' : ''}{sync.latestAttemptStatus === 'failed' ? 'The latest Basecamp import failed. ' : ''}Balances are provisional. Ops has not verified that its Basecamp connection can see every relevant project.</p>
        <p>Planning last saved: {timestamp(data.planningUpdatedAt)} · View refreshed: {timestamp(data.generatedAt)}</p>
      </details>
    </>}
  </section>;
}

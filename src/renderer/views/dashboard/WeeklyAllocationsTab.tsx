import React, { useCallback, useEffect, useRef, useState } from 'react';
import { allocationProgress, allocationWeekLabel, currentAllocationWeek, shiftAllocationDate, WeeklyAllocations } from '../../../shared/weeklyAllocations';
import '../../styles/weekly-allocations.css';

const hours = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}h`;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST' : 'Unknown';
const contextLabel: Record<string, string> = {
  no_weekly_allocation: 'No weekly allocation', not_project_member: 'Not a project member',
  inactive_project: 'Inactive project', on_hold_project: 'Project on hold', project_status_unverified: 'Project status unverified',
};

function AllocationTable({ projects, caption }: { projects: WeeklyAllocations['projects']; caption: string }) {
  return <div className="weekly-allocations-table-wrap"><table>
    <caption className="weekly-allocations-caption">{caption}</caption>
    <thead><tr><th scope="col">Project</th><th scope="col">Planned</th><th scope="col">Logged</th><th scope="col">Remaining</th></tr></thead>
    <tbody>{projects.map(project => {
      const progress = allocationProgress(project.plannedHours, project.recordedHours);
      const color = progress ? `weekly-allocations-${progress}` : undefined;
      return <tr key={project.basecampProjectId}>
      <th scope="row"><span className={color}>{project.projectName}</span><small>{project.allocationUpdatedAt ? `Allocation saved ${timestamp(project.allocationUpdatedAt)}` : 'No saved allocation for this week'}{project.allocationStatus === 'released' && ' · Commitment released'}{project.reasons.includes('project_access_unverified') && ' · Project access unverified'}</small>
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

export default function WeeklyAllocationsTab() {
  const [week, setWeek] = useState(() => currentAllocationWeek());
  const [data, setData] = useState<WeeklyAllocations | null>(null);
  const [error, setError] = useState('');
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
      const result = await window.zenstate.getWeeklyAllocations(week);
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
      ++generation.current; busy.current = false; setData(null); setError(''); void refresh();
    });
    return () => { ++generation.current; busy.current = false; clearInterval(interval); unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);

  const sync = data?.basecampSync;
  const allocated = data?.projects.filter(p => p.displayGroup === 'allocated') ?? [];
  const otherRecorded = data?.projects.filter(p => p.displayGroup === 'other_recorded') ?? [];
  const stale = !!sync && (sync.freshness !== 'fresh' || !sync.lastSuccessfulAt || now - Date.parse(sync.lastSuccessfulAt) > sync.staleAfterSeconds * 1000);
  return <section className="weekly-allocations" aria-labelledby="weekly-allocation-title">
    <div className="weekly-allocations-heading">
      <h2 id="weekly-allocation-title">Your weekly allocation</h2>
      <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="weekly-allocations-navigation" aria-label="Allocation week">
      <button aria-label="Previous allocation week" onClick={() => setWeek(shiftAllocationDate(week, -7))}>←</button>
      <div className="weekly-allocations-week"><strong>{allocationWeekLabel(week)}</strong><span>{week === currentAllocationWeek() ? 'This week' : week < currentAllocationWeek() ? 'Past week' : 'Upcoming week'}</span></div>
      <button aria-label="Next allocation week" onClick={() => setWeek(shiftAllocationDate(week, 7))}>→</button>
      <button disabled={week === currentAllocationWeek()} onClick={() => setWeek(currentAllocationWeek())}>This week</button>
    </div>
    {error && <div role="alert" className="weekly-allocations-notice">{error}</div>}
    {loading && !data && <p role="status">Loading your allocations…</p>}
    {data && sync && <>
      <div className="weekly-allocations-sync" role="status">
        <div><strong>Last time update</strong><span>{timestamp(sync.lastSuccessfulAt)}</span></div>
        <span className="weekly-allocations-sync-status">{sync.latestAttemptStatus === 'failed' ? 'Import failed' : stale ? 'Time data outdated' : sync.weekCoverage === 'unavailable' ? 'Time data unavailable' : sync.weekCoverage === 'partial' ? 'Partial time data' : 'Latest imported time'} · Provisional</span>
      </div>
      <h3 className="weekly-allocations-section-title">Allocated billable projects</h3>
      {allocated.length > 0 ? <AllocationTable projects={allocated} caption={`Allocated billable projects for ${week}`} /> : <p>No active billable project allocations for this week.</p>}
      {otherRecorded.length > 0 && <details key={week} className="weekly-allocations-other">
        <summary>Other recorded billable projects <span>({otherRecorded.length}) · {hours(otherRecorded.reduce((total, project) => total + (project.recordedHours ?? 0), 0))} logged</span></summary>
        <p>Billable work without a weekly allocation, outside your current project membership, or on inactive/on-hold projects.</p>
        <AllocationTable projects={otherRecorded} caption={`Other recorded billable projects for ${week}`} />
      </details>}
      <details className="weekly-allocations-info">
        <summary>About these hours &amp; update details</summary>
        <p>Billable projects only. Saved allocations refresh every minute while this view is open. Logged hours come from Basecamp’s last import into Everything Ops.</p>
        <p>Running, unposted and not-yet-imported time is not included. Allocations never limit time recording.</p>
        <p>Green: recorded time below plan. Yellow: plan matched. Red: over plan. Projects with no recorded time or no allocation stay neutral. Colours describe imported time, not project completion.</p>
        <p>{sync.recordedFrom && sync.recordedThrough ? `Recorded dates covered: ${sync.recordedFrom} – ${sync.recordedThrough}.` : 'This week has no imported time coverage.'} {sync.weekCoverage === 'week_to_date' ? 'This week is still in progress.' : sync.weekCoverage === 'partial' ? 'Some dates in this week are missing from the import.' : ''}</p>
        <p>{stale ? 'Time data is stale or its freshness is unknown. ' : ''}{sync.latestAttemptStatus === 'failed' ? 'The latest Basecamp import failed. ' : ''}Balances are provisional. Ops has not verified that its Basecamp connection can see every relevant project.</p>
        <p>Planning last saved: {timestamp(data.planningUpdatedAt)} · View refreshed: {timestamp(data.generatedAt)}</p>
      </details>
    </>}
  </section>;
}

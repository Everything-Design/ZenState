import { parseWeeklyAllocations, validAllocationWeek, WeeklyAllocationResult } from '../../shared/weeklyAllocations';

// Never accept a URL from a renderer, saved profile, or server response: the bearer token
// may only be sent to this agency-controlled HTTPS endpoint. Redirects are forbidden.
const ENDPOINT = 'https://everything-ops-workspace.vercel.app/api/me/weekly-allocations';
export interface PlanningCredential { accessToken: string; accountId: string; identityKey: string }

export async function fetchWeeklyAllocations(week: unknown, credential: () => PlanningCredential | null, fetcher: typeof fetch = fetch): Promise<WeeklyAllocationResult> {
  if (!validAllocationWeek(week)) return { ok: false, error: 'Choose a valid Monday.' };
  try {
    const auth = credential();
    if (!auth) return { ok: false, error: 'A current Basecamp connection is needed to view allocations. Time recording is unaffected.' };
    const response = await fetcher(`${ENDPOINT}?weekStart=${week}`, {
      method: 'GET', headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    const current = credential();
    if (!current || current.identityKey !== auth.identityKey || current.accountId !== auth.accountId || current.accessToken !== auth.accessToken) return { ok: false, error: 'Basecamp connection changed. Refresh allocations.' };
    if (!response.ok) return { ok: false, error: response.status === 401 ? 'Basecamp could not verify this connection. Time recording is unaffected.' : response.status === 403 ? 'Weekly planning is not available for this Basecamp account.' : 'Weekly planning is temporarily unavailable. Time recording is unaffected.' };
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error('Response too large');
    const latest = credential();
    if (!latest || latest.identityKey !== auth.identityKey || latest.accountId !== auth.accountId || latest.accessToken !== auth.accessToken) return { ok: false, error: 'Basecamp connection changed. Refresh allocations.' };
    return { ok: true, data: parseWeeklyAllocations(JSON.parse(body), auth.accountId, week) };
  } catch {
    return { ok: false, error: 'Weekly planning is temporarily unavailable. Time recording is unaffected.' };
  }
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, AvailabilityStatus, DailyRecord, IPC, AppSettings, LicenseState, BasecampAuthState, BasecampCredentials, BasecampProject, BasecampTodoList, BasecampTodo, BasecampTimesheetEntry, BasecampPerson, BasecampNotification, TodayPlan, PinnedTodo, RecentTodo, PeerGroup, ReceivedPing } from '../shared/types';
import DashboardView from './views/DashboardView';
import LoginView from './views/LoginView';
import WhatsNewModal from './components/WhatsNewModal';
import CheckInModal from './components/CheckInModal';

// Type declaration for the preload bridge
declare global {
  interface Window {
    zenstate: {
      getUser: () => Promise<User | null>;
      saveUser: (user: User) => Promise<boolean>;
      getPeers: () => Promise<User[]>;
      updateStatus: (status: AvailabilityStatus) => void;
      updateUser: (updates: Partial<User>) => void;
      sendMeetingRequest: (userId: string, message?: string) => void;
      cancelMeetingRequest: (userId: string) => void;
      respondMeetingRequest: (userId: string, accepted: boolean, message?: string) => void;
      sendEmergencyRequest: (userId: string, message?: string) => void;
      grantEmergencyAccess: (userId: string, granted: boolean) => void;
      startTimer: (taskLabel: string, category?: string, targetDuration?: number, basecamp?: { accountId: number; projectId: number; todoId: number; todoListId?: number; projectName?: string }) => void;
      stopTimer: () => void;
      pauseTimer: () => void;
      resumeTimer: () => void;
      openDashboard: (tab?: string) => void;
      openDashboardAndPin: () => void;
      closePopover: () => void;
      quit: () => void;
      login: (user: User) => void;
      signOut: () => void;
      getRecords: (month?: string) => Promise<DailyRecord[]>;
      deleteSession: (sessionId: string, date: string) => Promise<{ ok: boolean; basecampDeleted: boolean; hadBasecampLink: boolean; error?: string }>;
      updateSession: (sessionId: string, date: string, updates: unknown) => Promise<{ ok: boolean; basecampSynced: boolean; needsManualFix: boolean; error?: string }>;
      addSession: (data: { taskLabel: string; duration: number; startTime: string; notes?: string; basecamp?: { accountId: number; projectId: number; todoId: number; todoListId?: number } | null }) => Promise<{ ok: boolean; sessionId?: string; dateStr?: string; error?: string }>;
      getAppVersion: () => Promise<string>;
      resetAllData: () => Promise<boolean>;
      installUpdate: () => void;
      checkForUpdate: () => Promise<void>;
      getLoginItemSettings: () => Promise<boolean>;
      setLoginItemSettings: (enabled: boolean) => void;
      getCategories: () => Promise<string[]>;
      saveCategories: (categories: string[]) => Promise<boolean>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<boolean>;
      setStatusRevert: (seconds: number) => void;
      cancelStatusRevert: () => void;
      timerLongRunRespond: (payload: { action: 'continue' | 'stop' | 'backdate'; stopAtIso?: string }) => void;
      timerIdleRespond: (payload: { action: 'continue' | 'pause' | 'backdate'; stopAtIso?: string; enableMeetingMode?: boolean }) => void;
      timerSetMeetingMode: (on: boolean) => void;
      timerTimesheetConfirm: (payload: { action: 'post' | 'discard'; hours?: string; notes?: string; durationSec?: number; additionalPersonIds?: number[] }) => void;
      miniTimerResize: (size: { width: number; height: number }) => void;
      miniTimerMoveBy: (delta: { dx: number; dy: number }) => void;
      miniTimerGetNotes: () => Promise<string>;
      miniTimerSetNotes: (notes: string) => void;
      teamSendPing: (data: { recipientIds: string[]; message: string }) => Promise<{ ok: boolean; delivered: number; total?: number; error?: string }>;
      teamGetRecentPings: () => Promise<ReceivedPing[]>;
      teamDismissPing: (pingId: string) => Promise<ReceivedPing[]>;
      groupsGet: () => Promise<PeerGroup[]>;
      groupsSave: (group: PeerGroup) => Promise<PeerGroup[]>;
      groupsDelete: (groupId: string) => Promise<PeerGroup[]>;
      activateLicense: (key: string) => Promise<LicenseState>;
      getLicenseState: () => Promise<LicenseState>;
      deactivateLicense: () => Promise<LicenseState>;
      bcGetCredentials: () => Promise<BasecampCredentials | null>;
      bcSaveCredentials: (creds: BasecampCredentials) => Promise<boolean>;
      bcConnect: () => Promise<{ ok: boolean; error?: string; state?: BasecampAuthState }>;
      bcCancelConnect: () => Promise<boolean>;
      bcDisconnect: () => Promise<BasecampAuthState>;
      bcGetAuthState: () => Promise<BasecampAuthState>;
      bcListProjects: () => Promise<{ ok: boolean; data?: BasecampProject[]; error?: string }>;
      bcListTodoLists: (projectId: number, todoSetId: number) => Promise<{ ok: boolean; data?: BasecampTodoList[]; error?: string }>;
      bcListTodos: (projectId: number, todoListId: number) => Promise<{ ok: boolean; data?: BasecampTodo[]; error?: string }>;
      bcCreateTodo: (data: { projectId: number; todoListId: number; content: string; description?: string; parentId?: number; dueOn?: string }) => Promise<{ ok: boolean; data?: BasecampTodo; error?: string }>;
      bcListProjectMembers: (projectId: number) => Promise<{ ok: boolean; data?: BasecampPerson[]; error?: string }>;
      bcPostComment: (data: { projectId: number; todoId: number; content: string }) => Promise<{ ok: boolean; error?: string }>;
      bcCreateTimeEntry: (data: { todoId: number; date: string; hours: string; description?: string }) => Promise<{ ok: boolean; data?: BasecampTimesheetEntry; error?: string }>;
      bcGetProjectTimesheet: (projectId: number) => Promise<{ ok: boolean; data?: BasecampTimesheetEntry[]; error?: string }>;
      bcBackfillTimesheet: () => Promise<{ ok: boolean; data?: { migrated: number; failed: number; totalUnsynced: number; groups: number; failures?: string[] }; error?: string }>;
      // v5.2 — Check-ins
      bcGetQuestionnaireForProject: (projectId: number) => Promise<unknown>;
      bcGetQuestions: (projectId: number, questionnaireId: number) => Promise<unknown[]>;
      bcPostQuestionAnswer: (projectId: number, questionId: number, content: string) => Promise<{ ok: boolean; error?: string }>;
      // v5.2 — Notifications ("Hey!" panel)
      bcGetNotifications: () => Promise<{ ok: boolean; data?: { unreads: BasecampNotification[]; reads: BasecampNotification[] }; error?: string }>;
      bcMarkNotificationRead: (notificationId: number) => Promise<{ ok: boolean; error?: string }>;
      // Open a URL in the system browser (http/https only).
      openExternal: (url: string) => Promise<void>;
      todayGet: () => Promise<{ plan: TodayPlan; recents: RecentTodo[] }>;
      todayPin: (item: PinnedTodo) => Promise<TodayPlan>;
      todayUnpin: (todoId: number) => Promise<TodayPlan>;
      todayReorder: (todoIds: number[]) => Promise<TodayPlan>;
      todaySetEstimate: (todoId: number, minutes: number | null) => Promise<TodayPlan>;
      todayToggleComplete: (todoId: number) => Promise<TodayPlan>;
      tomorrowGet: () => Promise<TodayPlan>;
      tomorrowPin: (item: PinnedTodo) => Promise<TodayPlan>;
      tomorrowUnpin: (todoId: number) => Promise<TodayPlan>;
      tomorrowReorder: (todoIds: number[]) => Promise<TodayPlan>;
      tomorrowSetEstimate: (todoId: number, minutes: number | null) => Promise<TodayPlan>;
      tomorrowToggleComplete: (todoId: number) => Promise<TodayPlan>;
      recentsGet: () => Promise<RecentTodo[]>;
      alertGetData: () => Promise<unknown>;
      todayPinMany: (items: PinnedTodo[]) => Promise<TodayPlan>;
      tomorrowPinMany: (items: PinnedTodo[]) => Promise<TodayPlan>;
      pickAvatarImage: () => Promise<string | null>;
      bcUpdateTimeEntry: (data: { entryId: number; date?: string; hours?: string; description?: string; personId?: number }) => Promise<{ ok: boolean; data?: BasecampTimesheetEntry; error?: string }>;
      bcDeleteTimeEntry: (entryId: number) => Promise<{ ok: boolean; error?: string }>;
      bcGetMyAssignments: () => Promise<{ ok: boolean; data?: BasecampTodo[]; error?: string }>;
      bcGetMyAssignmentsDue: (scope: string) => Promise<{ ok: boolean; data?: BasecampTodo[]; error?: string }>;
      bcSearchTodos: (query: string) => Promise<{ ok: boolean; data?: BasecampTodo[]; error?: string }>;
      connectToIP: (host: string, port: number) => Promise<{ ok: boolean; error?: string }>;
      getLocalInfo: () => Promise<{ addresses: string[]; port: number }>;
      getWiFiInfo: () => Promise<{ ssid?: string; bssid?: string; error?: string }>;
      // Returns an unsubscribe function — call it in useEffect cleanup to
      // detach just this listener (instead of nuking every listener on the
      // channel via removeAllListeners).
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

interface TimerState {
  elapsed: number;
  isRunning: boolean;
  isPaused: boolean;
  taskLabel: string;
  category?: string;
  targetDuration?: number;
  remaining?: number;
  // v5.1.4 — Basecamp todoId of the currently-running session (undefined for
  // non-Basecamp timer sessions). Used by row "running" indicators to
  // disambiguate when two pinned todos share the same name.
  basecampTodoId?: number;
}

export default function DashboardApp() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [peers, setPeers] = useState<User[]>([]);
  const [timerState, setTimerState] = useState<TimerState>({
    elapsed: 0,
    isRunning: false,
    isPaused: false,
    taskLabel: '',
  });
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  // Persistent banner shown when Basecamp's refresh-token flow forced a
  // disconnect (typically because the user revoked the integration on
  // Basecamp's side, or the refresh token expired). User must reconnect
  // to resume timesheet syncs.
  const [needsBasecampReauth, setNeedsBasecampReauth] = useState(false);
  const [statusRevertRemaining, setStatusRevertRemaining] = useState(0);
  const [requestedTab, setRequestedTab] = useState<string | undefined>(undefined);
  const [licenseState, setLicenseState] = useState<LicenseState>({ isValid: false, isPro: false, isAdmin: false, payload: null });
  const prevTimerRunning = useRef(false);
  const [loading, setLoading] = useState(true);
  // v5.1.4 — What's New modal. Shown once per upgrade. `whatsNewHighlight`
  // is set to the current version's bullets when the user hasn't seen them
  // yet; dismissing writes the version back to settings so it stays closed.
  const [whatsNewHighlight, setWhatsNewHighlight] = useState<import('../shared/whatsNew').ReleaseHighlight | null>(null);
  // v5.2 — Daily check-in modal. Fired by main at 9:05am on weekdays when
  // the user hasn't already answered/dismissed today's check-in.
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInDate, setCheckInDate] = useState('');
  // v5.2 — Toast for multi-person timesheet result (extra-people-result IPC).
  const [extraPeopleToast, setExtraPeopleToast] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    async function init() {
      const user = await window.zenstate.getUser();
      setCurrentUser(user);
      if (user) {
        const peerList = await window.zenstate.getPeers();
        setPeers(peerList);
      }
      const allRecords = await window.zenstate.getRecords() as DailyRecord[];
      setRecords(allRecords);
      const license = await window.zenstate.getLicenseState();
      setLicenseState(license);
      setLoading(false);

      // v5.1.4 — What's-new modal. Show the current version's highlights once
      // per upgrade. Suppressed on a *fresh install* (no prior user yet) so
      // first-launch onboarding isn't interrupted; the next upgrade will show
      // it normally. Only triggered when there's a real version mismatch.
      try {
        const [version, settings, { getHighlightForVersion }] = await Promise.all([
          window.zenstate.getAppVersion(),
          window.zenstate.getSettings(),
          import('../shared/whatsNew'),
        ]);
        if (user && version && settings.lastSeenWhatsNewVersion !== version) {
          const highlight = getHighlightForVersion(version);
          if (highlight) setWhatsNewHighlight(highlight);
        }
      } catch (err) {
        console.warn('[whatsNew] check failed:', err);
      }
    }
    init();
  }, []);

  // v5.1.4 — Dismiss callback for the What's New modal. Persists the current
  // version so the modal stays closed until the next upgrade.
  const handleDismissWhatsNew = useCallback(async () => {
    setWhatsNewHighlight(null);
    try {
      const version = await window.zenstate.getAppVersion();
      const settings = await window.zenstate.getSettings();
      await window.zenstate.saveSettings({ ...settings, lastSeenWhatsNewVersion: version });
    } catch (err) {
      console.warn('[whatsNew] dismiss persistence failed:', err);
    }
  }, []);

  // Each on() returns its own unsubscribe so unmount cleanup detaches only
  // this component's listeners (the old removeAllListeners pattern would
  // nuke sibling listeners on the same channel — e.g. a child component in
  // the dashboard listening on the same event would lose its subscription
  // when the parent unmounted).
  useEffect(() => {
    const offs = [
      window.zenstate.on(IPC.PEER_DISCOVERED, (peer: unknown) => {
        const p = peer as User;
        setCurrentUser((cur) => {
          if (cur && cur.id === p.id) return cur;
          setPeers((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = p;
              return updated;
            }
            return [...prev, p];
          });
          return cur;
        });
      }),
      window.zenstate.on(IPC.PEER_UPDATED, (peer: unknown) => {
        const p = peer as User;
        setCurrentUser((cur) => {
          if (cur && cur.id === p.id) return p;
          setPeers((prev) => {
            const idx = prev.findIndex((x) => x.id === p.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = p;
              return updated;
            }
            return [...prev, p];
          });
          return cur;
        });
      }),
      window.zenstate.on(IPC.PEER_LOST, (peerId: unknown) => {
        setPeers((prev) => prev.filter((p) => p.id !== (peerId as string)));
      }),
      window.zenstate.on(IPC.TIMER_UPDATE, (data: unknown) => {
        setTimerState(data as TimerState);
      }),
      window.zenstate.on(IPC.EMERGENCY_ACCESS, (granted: unknown) => {
        setCurrentUser((prev) => prev ? { ...prev, canSendEmergency: granted as boolean } : prev);
      }),
      window.zenstate.on(IPC.STATUS_REVERT_TICK, (data: unknown) => {
        const tick = data as { remaining: number };
        setStatusRevertRemaining(tick.remaining);
      }),
      window.zenstate.on('update:downloaded', (data: unknown) => {
        const info = data as { version: string };
        setUpdateAvailable(info.version);
      }),
      window.zenstate.on('dashboard:switch-tab', (tab: unknown) => {
        setRequestedTab(tab as string);
      }),
      window.zenstate.on('license:changed', (state: unknown) => {
        setLicenseState(state as LicenseState);
      }),
      window.zenstate.on('user:logged-in', (user: unknown) => {
        setCurrentUser(user as User);
      }),
      window.zenstate.on('basecamp:reauth-required', () => {
        setNeedsBasecampReauth(true);
      }),
      // If auth changes back to connected (user re-authed), clear the banner.
      window.zenstate.on('basecamp:auth-changed', (state: unknown) => {
        const s = state as { isConnected?: boolean };
        if (s?.isConnected) setNeedsBasecampReauth(false);
      }),
      // v5.1.3 — Refresh records on every Basecamp timesheet-state change.
      // Fires from: TIMER_TIMESHEET_CONFIRM post, stopTimer auto-post,
      // ADD_SESSION, UPDATE_SESSION, DELETE_SESSION, BC_BACKFILL_TIMESHEET.
      // Previously the records were only refreshed by the 500ms-after-stop
      // setTimeout, which fired BEFORE the user had a chance to edit hours
      // in the "Review before posting" popup. By the time the post handler
      // updated the local session's duration, the renderer had already cached
      // the original timer-measured value and there was no event to trigger
      // a re-fetch — so Plan / Timesheet showed the wrong duration.
      window.zenstate.on('basecamp:timesheet-updated', () => {
        window.zenstate.getRecords().then((rs) => {
          setRecords(rs as DailyRecord[]);
        }).catch(() => { });
      }),
      // v5.2 — Daily check-in prompt from main (9:05am weekdays).
      window.zenstate.on(IPC.CHECKIN_PROMPT, (data: unknown) => {
        const payload = data as { date: string };
        setCheckInDate(payload?.date ?? '');
        setCheckInOpen(true);
      }),
      // v5.2 — Multi-person timesheet result: show a brief toast summarising
      // how many teammate entries succeeded and who was skipped.
      window.zenstate.on('basecamp:timesheet-extra-people-result', (data: unknown) => {
        const result = data as { succeeded: number[]; failed: { personId: number; message: string }[] };
        const nOk = result.succeeded?.length ?? 0;
        const nFail = result.failed?.length ?? 0;
        let message = '';
        if (nOk > 0 && nFail === 0) {
          message = `Time logged for ${nOk} teammate${nOk > 1 ? 's' : ''}.`;
        } else if (nOk > 0 && nFail > 0) {
          message = `Time logged for ${nOk} teammate${nOk > 1 ? 's' : ''}; ${nFail} skipped (insufficient permission).`;
        } else {
          message = `Could not log time for ${nFail} teammate${nFail > 1 ? 's' : ''} — insufficient permission.`;
        }
        setExtraPeopleToast({ message, isError: nFail > 0 && nOk === 0 });
        setTimeout(() => setExtraPeopleToast(null), 5000);
      }),
    ];
    return () => { offs.forEach((off) => off()); };
  }, []);

  // Auto-refresh records when timer stops
  useEffect(() => {
    if (prevTimerRunning.current && !timerState.isRunning) {
      // Timer just stopped — refresh records after a brief delay for persistence
      setTimeout(async () => {
        const allRecords = await window.zenstate.getRecords() as DailyRecord[];
        setRecords(allRecords);
      }, 500);
    }
    prevTimerRunning.current = timerState.isRunning || timerState.isPaused;
  }, [timerState.isRunning, timerState.isPaused]);

  const refreshRecords = useCallback(async () => {
    const allRecords = await window.zenstate.getRecords() as DailyRecord[];
    setRecords(allRecords);
  }, []);

  const handleStatusChange = useCallback((status: AvailabilityStatus) => {
    if (!currentUser) return;
    const updated = { ...currentUser, status };
    setCurrentUser(updated);
    window.zenstate.updateStatus(status);
  }, [currentUser]);

  const handleUserUpdate = useCallback((updates: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    window.zenstate.updateUser(updates);
    window.zenstate.saveUser(updated);
  }, [currentUser]);

  const handleSignOut = useCallback(() => {
    window.zenstate.signOut();
    setCurrentUser(null);
    setPeers([]);
  }, []);

  const handleLogin = useCallback(async (user: User) => {
    await window.zenstate.saveUser(user);
    window.zenstate.login(user);
    setCurrentUser(user);
  }, []);

  if (loading) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="pulse" style={{ color: 'var(--zen-secondary-text)' }}>Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <LoginView onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <>
      {/* Basecamp re-auth banner — shows when a 401 → refresh-failed cascade
          forced a disconnect. Persistent until the user reconnects (or
          dismisses), since silently dropping syncs would surprise them. */}
      {needsBasecampReauth && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 201,
          background: 'var(--status-occupied, #ff9500)',
          color: 'white',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          fontWeight: 500,
        }}>
          <span style={{ flex: 1 }}>
            Basecamp session expired — reconnect in Settings to keep syncing your timesheet.
          </span>
          <button
            onClick={() => { setRequestedTab('settings'); }}
            style={{
              background: 'rgba(255,255,255,0.22)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Open Settings
          </button>
          <button
            onClick={() => setNeedsBasecampReauth(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: 14,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Update notification banner */}
      {updateAvailable && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: 'var(--zen-primary)',
          color: 'white',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          fontWeight: 500,
        }}>
          <span style={{ flex: 1 }}>
            ZenState v{updateAvailable} is ready. Restart to update.
          </span>
          <button
            onClick={() => window.zenstate.installUpdate()}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Restart Now
          </button>
          <button
            onClick={() => setUpdateAvailable(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: 14,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <DashboardView
        currentUser={currentUser}
        peers={peers}
        timerState={timerState}
        records={records}
        statusRevertRemaining={statusRevertRemaining}
        requestedTab={requestedTab}
        isPro={licenseState.isPro}
        licenseState={licenseState}
        onLicenseStateChange={setLicenseState}
        onRequestedTabHandled={() => setRequestedTab(undefined)}
        onRefreshRecords={refreshRecords}
        onStatusChange={handleStatusChange}
        onUserUpdate={handleUserUpdate}
        onSignOut={handleSignOut}
      />
      {/* v5.1.4 — What's New modal (one-shot per upgrade). */}
      {whatsNewHighlight && (
        <WhatsNewModal highlight={whatsNewHighlight} onDismiss={handleDismissWhatsNew} />
      )}
      {/* v5.2 — Daily Basecamp check-in modal (9:05am weekdays). */}
      <CheckInModal
        open={checkInOpen}
        date={checkInDate}
        onClose={() => setCheckInOpen(false)}
      />
      {/* v5.2 — Multi-person timesheet result toast. Auto-dismisses after 5s. */}
      {extraPeopleToast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 300,
          background: extraPeopleToast.isError ? 'var(--status-focused, #e74c3c)' : 'var(--status-available, #2ecc71)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          maxWidth: 360,
          textAlign: 'center',
        }}>
          {extraPeopleToast.message}
        </div>
      )}
    </>
  );
}

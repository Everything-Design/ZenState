import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Users, ClipboardList, Settings, MessageCircle, CalendarDays, CalendarRange } from 'lucide-react';
import { User, AvailabilityStatus, DailyRecord, LicenseState, sessionNeedsBasecampReview } from '../../shared/types';
import Avatar from '../components/Avatar';
import { formatRevertTime } from '../utils/format';
import { getStatusColor, getStatusLabel } from '../utils/status';
import PlanTab from './dashboard/PlanTab';

// v5.6.0 — Lazy-load secondary tabs so the dashboard's initial bundle ships
// only the Plan view (the default + most-used surface). Team, Timesheet,
// and Settings each become their own chunk that's fetched on first tab
// click. Reduces the initial JS payload by roughly half on first paint.
const TeamTab = lazy(() => import('./dashboard/TeamTab'));
const TimesheetTab = lazy(() => import('./dashboard/TimesheetTab'));
const SettingsTab = lazy(() => import('./dashboard/SettingsTab'));
const WeeklyAllocationsTab = lazy(() => import('./dashboard/WeeklyAllocationsTab'));

// Lightweight fallback while a tab chunk loads. Centred, low-noise.
function TabLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--zen-tertiary-text)', fontSize: 13 }}>
      Loading…
    </div>
  );
}

interface TimerState {
  elapsed: number;
  isRunning: boolean;
  isPaused: boolean;
  taskLabel: string;
  category?: string;
}

interface Props {
  currentUser: User;
  peers: User[];
  timerState: TimerState;
  records: DailyRecord[];
  statusRevertRemaining?: number;
  requestedTab?: string;
  isPro: boolean;
  licenseState: LicenseState;
  onLicenseStateChange: (state: LicenseState) => void;
  onRequestedTabHandled?: () => void;
  onRefreshRecords: () => Promise<DailyRecord[]>;
  onStatusChange: (status: AvailabilityStatus) => void;
  onUserUpdate: (updates: Partial<User>) => void;
  onSignOut: () => void;
}

const REVERT_OPTIONS = [
  { label: '15m', seconds: 15 * 60 },
  { label: '30m', seconds: 30 * 60 },
  { label: '1h', seconds: 60 * 60 },
  { label: '2h', seconds: 2 * 60 * 60 },
  { label: 'None', seconds: 0 },
];

type Tab = 'plan' | 'allocations' | 'team' | 'timesheet' | 'settings';

export default function DashboardView({ currentUser, peers, timerState, records, statusRevertRemaining, requestedTab, isPro, licenseState, onLicenseStateChange, onRequestedTabHandled, onRefreshRecords, onStatusChange, onUserUpdate, onSignOut }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('plan');
  const unpostedCount = records.reduce((count, record) => count + record.sessions.filter(sessionNeedsBasecampReview).length, 0);
  const [syncingBasecamp, setSyncingBasecamp] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ error: boolean; message: string } | null>(null);

  async function handleSyncBasecamp() {
    if (syncingBasecamp) return;
    setSyncingBasecamp(true);
    setSyncNotice(null);
    try {
      const result = await window.zenstate.bcBackfillTimesheet();
      const latestRecords = await onRefreshRecords();
      const remaining = latestRecords.flatMap((record) => record.sessions.filter(sessionNeedsBasecampReview));
      const unmapped = remaining.filter((session) => !session.basecamp?.todoId && !session.basecamp?.recordingId);
      if (remaining.length) setActiveTab('timesheet');
      if (!result.ok) {
        setSyncNotice({ error: true, message: result.error || 'Basecamp sync failed. Review the remaining sessions in Timesheet.' });
      } else if (remaining.length) {
        const synced = result.data?.migrated ?? 0;
        const needsReview = remaining.length - unmapped.length;
        setSyncNotice({
          error: needsReview > 0,
          message: [
            synced ? `${synced} ${synced === 1 ? 'session' : 'sessions'} synced.` : '',
            unmapped.length ? `${unmapped.length} ${unmapped.length === 1 ? 'session needs' : 'sessions need'} a Basecamp to-do.` : '',
            needsReview ? `${needsReview} ${needsReview === 1 ? 'session needs' : 'sessions need'} review or retry.` : '',
          ].filter(Boolean).join(' '),
        });
      } else {
        const synced = result.data?.migrated ?? 0;
        setSyncNotice({ error: false, message: synced
          ? `${synced} ${synced === 1 ? 'session' : 'sessions'} synced to Basecamp.`
          : 'All recorded time is already synced to Basecamp.' });
      }
    } catch (err) {
      setSyncNotice({ error: true, message: (err as Error).message || 'Basecamp sync failed.' });
    } finally {
      setSyncingBasecamp(false);
    }
  }
  useEffect(() => {
    if (!requestedTab) return;
    // Legacy "today" requests (from older code paths or notifications) still
    // route to the renamed Plan tab so deep-links don't break.
    const normalised = requestedTab === 'today' ? 'plan' : requestedTab;
    if (['plan', 'allocations', 'team', 'timesheet', 'settings'].includes(normalised)) {
      setActiveTab(normalised as Tab);
      onRequestedTabHandled?.();
    }
  }, [requestedTab]);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusInput, setStatusInput] = useState('');
  const [showRevertPicker, setShowRevertPicker] = useState<AvailabilityStatus | null>(null);

  function handleSetStatusMessage() {
    if (!statusInput.trim()) return;
    onUserUpdate({
      activeStatusMessage: statusInput.trim(),
      statusMessageExpiry: undefined,
    });
    setStatusInput('');
    setEditingStatus(false);
  }

  function handleClearStatusMessage() {
    onUserUpdate({
      activeStatusMessage: undefined,
      statusMessageExpiry: undefined,
    });
    setEditingStatus(false);
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <div className="dashboard-sidebar">
        {/* Drag region for macOS traffic lights */}
        <div className="drag-region" style={{ height: (window as any).zenstate?.platform === 'darwin' ? 52 : 16, flexShrink: 0 }} />

        {/* Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="avatar" style={{
            width: 44,
            height: 44,
            background: currentUser.avatarColor || '#007AFF',
            fontSize: 22,
            flexShrink: 0,
          }}>
            <div className={`status-ring ${currentUser.status}`} />
            {currentUser.avatarImageData ? (
              <Avatar data={currentUser.avatarImageData} mime={currentUser.avatarImageMime} isSelf style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : currentUser.avatarEmoji ? (
              <span>{currentUser.avatarEmoji}</span>
            ) : (
              <span style={{ fontSize: 18, fontWeight: 600, color: 'white' }}>{currentUser.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: 11, color: getStatusColor(currentUser.status), display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className={`status-dot ${currentUser.status}`} />
              {getStatusLabel(currentUser.status)}
            </div>
          </div>
        </div>

        {/* Status Message */}
        {editingStatus ? (
          <div style={{ marginBottom: 10 }}>
            <input
              className="text-input"
              placeholder="What's your status?"
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSetStatusMessage();
                if (e.key === 'Escape') setEditingStatus(false);
              }}
              style={{ fontSize: 11, marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: 10 }} onClick={handleSetStatusMessage} disabled={!statusInput.trim()}>
                Set
              </button>
              {currentUser.activeStatusMessage && (
                <button className="btn btn-danger" style={{ fontSize: 10 }} onClick={handleClearStatusMessage}>
                  Clear
                </button>
              )}
              <button className="btn btn-secondary" style={{ fontSize: 10 }} onClick={() => setEditingStatus(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { setStatusInput(currentUser.activeStatusMessage || ''); setEditingStatus(true); }}
            style={{
              fontSize: 11,
              color: 'var(--zen-secondary-text)',
              cursor: 'pointer',
              marginBottom: 10,
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {currentUser.activeStatusMessage ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MessageCircle size={12} /> {currentUser.activeStatusMessage}</span>
            ) : (
              <span style={{ color: 'var(--zen-tertiary-text)' }}>+ Set a status message...</span>
            )}
          </div>
        )}

        {/* Status Picker — colored circles */}
        <div style={{ display: 'flex', gap: 8, marginBottom: statusRevertRemaining && statusRevertRemaining > 0 ? 4 : 16, justifyContent: 'center' }}>
          {[AvailabilityStatus.Available, AvailabilityStatus.Occupied, AvailabilityStatus.Focused].map((status) => (
            <button
              key={status}
              onClick={() => {
                if (status === AvailabilityStatus.Occupied || status === AvailabilityStatus.Focused) {
                  if (showRevertPicker === status) {
                    setShowRevertPicker(null);
                  } else {
                    onStatusChange(status);
                    setShowRevertPicker(status);
                  }
                } else {
                  onStatusChange(status);
                  setShowRevertPicker(null);
                  (window as any).zenstate.cancelStatusRevert?.();
                }
              }}
              title={getStatusLabel(status)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: currentUser.status === status ? '2.5px solid white' : '2px solid transparent',
                background: getStatusColor(status),
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, transform 0.15s ease',
                transform: currentUser.status === status ? 'scale(1.1)' : 'scale(1)',
                boxShadow: currentUser.status === status ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none',
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Revert time picker (Pro only) */}
        {showRevertPicker && isPro && (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--zen-tertiary-text)', width: '100%', textAlign: 'center', marginBottom: 2 }}>
              Auto-revert to Available after:
            </span>
            {REVERT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className="category-chip"
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={() => {
                  if (opt.seconds > 0) {
                    (window as any).zenstate.setStatusRevert?.(opt.seconds);
                  } else {
                    (window as any).zenstate.cancelStatusRevert?.();
                  }
                  setShowRevertPicker(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Status revert countdown */}
        {statusRevertRemaining !== undefined && statusRevertRemaining > 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--zen-secondary-text)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}>
            <span>⏱ Reverting in {formatRevertTime(statusRevertRemaining)}</span>
            <button
              onClick={() => (window as any).zenstate.cancelStatusRevert?.()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--zen-tertiary-text)', fontSize: 10, fontFamily: 'inherit',
                padding: '0 2px',
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="divider" style={{ margin: '0 0 12px' }} />

        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
            onClick={() => setActiveTab('plan')}
          >
            <CalendarDays size={16} /> Plan
          </button>
          <button
            className={`tab-btn ${activeTab === 'allocations' ? 'active' : ''}`}
            onClick={() => setActiveTab('allocations')}
          >
            <CalendarRange size={16} /> Your week
          </button>
          <button
            className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <Users size={16} /> Team
          </button>
          <button
            className={`tab-btn ${activeTab === 'timesheet' ? 'active' : ''}`}
            onClick={() => setActiveTab('timesheet')}
          >
            <ClipboardList size={16} /> Timesheet
          </button>
          <button
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} /> Settings
          </button>
        </div>

        <div className="spacer" />
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {/* Drag strip at top for window dragging */}
        <div className="drag-strip" />
        {unpostedCount > 0 && <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 14px', marginBottom: 12,
            border: '1px solid var(--status-occupied)', borderRadius: 8, background: 'var(--zen-tertiary-bg)',
            color: 'var(--zen-text)', fontFamily: 'inherit', fontSize: 12, boxSizing: 'border-box' }}>
          <span style={{ flex: 1 }}>{unpostedCount} recorded time {unpostedCount === 1 ? 'session is' : 'sessions are'} waiting to sync with Basecamp.</span>
          <button className="btn btn-primary" onClick={handleSyncBasecamp} disabled={syncingBasecamp}>
            {syncingBasecamp ? 'Syncing…' : 'Sync Basecamp'}
          </button>
        </div>}
        {syncNotice && <div role={syncNotice.error ? 'alert' : 'status'} style={{
          color: syncNotice.error ? 'var(--status-occupied)' : 'var(--zen-secondary-text)',
          fontSize: 12, marginBottom: 12,
        }}>{syncNotice.message}</div>}
        {activeTab === 'plan' && (
          <PlanTab
            timerState={timerState}
            records={records}
            onOpenSettings={() => setActiveTab('settings')}
            onRefreshRecords={onRefreshRecords}
          />
        )}
        {activeTab === 'allocations' && (
          <Suspense fallback={<TabLoading />}>
            <WeeklyAllocationsTab records={records} timerState={timerState} onOpenTimesheet={() => setActiveTab('timesheet')} />
          </Suspense>
        )}
        {activeTab === 'team' && (
          <Suspense fallback={<TabLoading />}>
            <TeamTab currentUser={currentUser} peers={peers} />
          </Suspense>
        )}
        {activeTab === 'timesheet' && (
          <Suspense fallback={<TabLoading />}>
            <TimesheetTab
              records={records}
              isPro={isPro}
              onRefreshRecords={onRefreshRecords}
            />
          </Suspense>
        )}
        {activeTab === 'settings' && (
          <Suspense fallback={<TabLoading />}>
            <SettingsTab
              currentUser={currentUser}
              peers={peers}
              isPro={isPro}
              licenseState={licenseState}
              onLicenseStateChange={onLicenseStateChange}
              onUserUpdate={onUserUpdate}
              onSignOut={onSignOut}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

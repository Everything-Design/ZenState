import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Users, ClipboardList, Settings, MessageCircle, CalendarDays, Clock } from 'lucide-react';
import { User, AvailabilityStatus, DailyRecord, LicenseState } from '../../shared/types';
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
// v5.8.0 — Team time tracking surface. Lazy-loaded like the other secondary
// tabs; nav button only rendered for BC account admins, so non-admins never
// download the chunk in the first place.
const TeamTimeTab = lazy(() => import('./dashboard/TeamTimeTab'));

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
  onRefreshRecords: () => void;
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

type Tab = 'plan' | 'team' | 'timesheet' | 'teamtime' | 'settings';

export default function DashboardView({ currentUser, peers, timerState, records, statusRevertRemaining, requestedTab, isPro, licenseState, onLicenseStateChange, onRequestedTabHandled, onRefreshRecords, onStatusChange, onUserUpdate, onSignOut }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('plan');
  // v5.8.0 — BC account-admin flag. Drives whether the Team time tab nav
  // button + content are shown. Fetched once on mount via bcGetMe; failures
  // (not connected, transient) fall back to non-admin (safe default).
  const [bcAdmin, setBcAdmin] = useState<boolean>(false);
  useEffect(() => {
    (window.zenstate as unknown as { bcGetMe?: () => Promise<{ ok: boolean; data?: { admin?: boolean }; error?: string }> })
      .bcGetMe?.()
      .then((res) => { if (res?.ok) setBcAdmin(!!res.data?.admin); })
      .catch(() => { /* non-admin fallback */ });
  }, []);

  useEffect(() => {
    if (!requestedTab) return;
    // Legacy "today" requests (from older code paths or notifications) still
    // route to the renamed Plan tab so deep-links don't break.
    const normalised = requestedTab === 'today' ? 'plan' : requestedTab;
    if (['plan', 'team', 'timesheet', 'settings'].includes(normalised)) {
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
          {bcAdmin && (
            <button
              className={`tab-btn ${activeTab === 'teamtime' ? 'active' : ''}`}
              onClick={() => setActiveTab('teamtime')}
              title="Per-person time tracking across pinned projects (admin only)"
            >
              <Clock size={16} /> Team time
            </button>
          )}
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
        {activeTab === 'plan' && (
          <PlanTab
            timerState={timerState}
            records={records}
            onOpenSettings={() => setActiveTab('settings')}
            onRefreshRecords={onRefreshRecords}
          />
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
        {activeTab === 'teamtime' && bcAdmin && (
          <Suspense fallback={<TabLoading />}>
            <TeamTimeTab />
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

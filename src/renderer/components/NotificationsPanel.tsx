import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, RefreshCw, X } from 'lucide-react';
import { AppSettings, BasecampNotification } from '../../shared/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationData {
  unreads: BasecampNotification[];
  reads: BasecampNotification[];
}

type LoadState = 'idle' | 'loading' | 'ok' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const ago = (Date.now() - new Date(iso).getTime()) / 1000;
  if (ago < 60) return 'just now';
  if (ago < 3600) return `${Math.round(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.round(ago / 3600)}h ago`;
  return 'yesterday';
}

// ── NotificationRow ───────────────────────────────────────────────────────────

interface RowProps {
  notification: BasecampNotification;
  onOpen: (n: BasecampNotification) => void;
}

function NotificationRow({ notification, onOpen }: RowProps) {
  const n = notification;
  // v5.2.0+ — Mentions (and pings, which are private DMs) get a soft yellow
  // accent so they jump out from regular comment/chat noise. Same color
  // language as Basecamp's own "Hey!" mention highlight.
  const isMention = n.section === 'mentions' || n.section === 'pings';
  const baseBg = isMention ? 'rgba(255, 204, 0, 0.10)' : 'var(--zen-tertiary-bg)';
  const hoverBg = isMention ? 'rgba(255, 204, 0, 0.18)' : 'var(--zen-hover)';
  const borderColor = isMention ? 'rgba(255, 204, 0, 0.35)' : 'var(--zen-divider)';

  return (
    <button
      onClick={() => onOpen(n)}
      title={n.title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        background: baseBg,
        border: `1px solid ${borderColor}`,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background var(--duration-quick) var(--ease-standard)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hoverBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = baseBg; }}
    >
      {/* Top row: project name (left) + relative time (right). Project name
          is the most useful piece of context — many notifications share the
          same "title" (e.g. "Chat") so the project is what actually tells
          you where it's from. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, width: '100%' }}>
        <div style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: isMention ? '#b58900' : 'var(--zen-secondary-text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {isMention && '@ '}
          {n.bucketName || 'Basecamp'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--zen-tertiary-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatRelative(n.createdAt)}
        </div>
      </div>
      {/* Title — wraps onto multiple lines instead of clipping. */}
      <div style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--zen-text)',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        lineHeight: 1.35,
      }}>
        {n.title}
      </div>
      {/* Excerpt — also wraps, capped at 3 lines via line-clamp so very long
          messages don't blow up the row. */}
      {n.excerpt && (
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--zen-secondary-text)',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {n.excerpt}
        </div>
      )}
    </button>
  );
}

// ── NotificationsPanel ────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_UNREADS = 20;
const MAX_READS = 10;

interface Props {
  isBasecampConnected: boolean;
}

export default function NotificationsPanel({ isBasecampConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<NotificationData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read notificationsEnabled from settings once on mount
  useEffect(() => {
    window.zenstate.getSettings().then((s: AppSettings) => {
      setNotificationsEnabled(s.notificationsEnabled !== false);
    }).catch(() => {});
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isBasecampConnected) return;
    setLoadState('loading');
    try {
      const res = await window.zenstate.bcGetNotifications();
      if (res.ok) {
        setData(res.data as NotificationData);
        setLoadState('ok');
      } else {
        setLoadState('error');
      }
    } catch {
      setLoadState('error');
    }
  }, [isBasecampConnected]);

  // Initial fetch + poll
  useEffect(() => {
    if (!isBasecampConnected || !notificationsEnabled) return;
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBasecampConnected, notificationsEnabled, fetchNotifications]);

  // Re-fetch when popover opens
  useEffect(() => {
    if (!isBasecampConnected || !notificationsEnabled) return;
    const off = window.zenstate.on('popover:shown', () => { fetchNotifications(); });
    return off;
  }, [isBasecampConnected, notificationsEnabled, fetchNotifications]);

  // Collapse on Esc
  useEffect(() => {
    if (!expanded) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded]);

  // Collapse on outside click
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  // Don't render the bell if not connected
  if (!isBasecampConnected) return null;

  async function handleOpenNotification(n: BasecampNotification) {
    window.zenstate.openExternal(n.appUrl).catch(() => {});
    // v5.6.0 (audit #2) — Optimistic move from unreads to reads, with
    // rollback if the mark-read API call fails. Without the rollback, the
    // optimistic update hid the unread locally but the next 5-min poll
    // re-pulled it as unread from BC, creating a flickering badge loop
    // with no user action able to dismiss it.
    setData((prev) => {
      if (!prev) return prev;
      const stillUnread = prev.unreads.filter((u) => u.id !== n.id);
      const alreadyInReads = prev.reads.some((r) => r.id === n.id);
      return {
        unreads: stillUnread,
        reads: alreadyInReads ? prev.reads : [n, ...prev.reads],
      };
    });
    window.zenstate.bcMarkNotificationRead(n.id).catch((err) => {
      console.warn('[NotificationsPanel] mark-read failed, rolling back:', err);
      setData((prev) => {
        if (!prev) return prev;
        const alreadyUnread = prev.unreads.some((u) => u.id === n.id);
        return {
          unreads: alreadyUnread ? prev.unreads : [n, ...prev.unreads],
          reads: prev.reads.filter((r) => r.id !== n.id),
        };
      });
    });
  }

  const unreadCount = data?.unreads.length ?? 0;

  // ── Collapsed bell button ─────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div ref={panelRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          className="footer-icon-btn"
          onClick={() => setExpanded(true)}
          title="Basecamp notifications"
          style={{ position: 'relative' }}
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 3,
              right: 3,
              minWidth: 14,
              height: 14,
              borderRadius: 'var(--radius-pill)',
              background: 'var(--zen-primary)',
              color: 'white',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              padding: '0 3px',
              pointerEvents: 'none',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── Expanded overlay panel ────────────────────────────────────────────────
  const displayUnreads = (data?.unreads ?? []).slice(0, MAX_UNREADS);
  const displayReads = (data?.reads ?? []).slice(0, MAX_READS);

  return (
    <div ref={panelRef} style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'var(--zen-background)' }}
        onClick={() => setExpanded(false)}
      />

      {/* Panel */}
      <div className="fade-in" style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--zen-divider)',
          flexShrink: 0,
        }}>
          <Bell size={14} style={{ color: 'var(--zen-primary)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--zen-text)' }}>
            Notifications
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 6,
                fontSize: 10,
                background: 'var(--zen-primary)',
                color: 'white',
                borderRadius: 'var(--radius-pill)',
                padding: '1px 5px',
                fontWeight: 700,
              }}>
                {unreadCount}
              </span>
            )}
          </span>
          <button
            onClick={fetchNotifications}
            title="Refresh"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--zen-tertiary-text)', display: 'flex', padding: 4, borderRadius: 4 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--zen-text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--zen-tertiary-text)'; }}
          >
            <RefreshCw size={13} style={loadState === 'loading' ? { animation: 'pulse 1s ease-in-out infinite' } : {}} />
          </button>
          <button
            onClick={() => setExpanded(false)}
            title="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--zen-tertiary-text)', display: 'flex', padding: 4, borderRadius: 4 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--zen-text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--zen-tertiary-text)'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {!notificationsEnabled ? (
            <DisabledState />
          ) : loadState === 'error' ? (
            <ErrorState onRetry={fetchNotifications} />
          ) : loadState === 'loading' && data === null ? (
            <LoadingState />
          ) : displayUnreads.length === 0 && displayReads.length === 0 ? (
            <EmptyState />
          ) : (
            <NotificationList
              unreads={displayUnreads}
              reads={displayReads}
              onOpen={handleOpenNotification}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inner components ──────────────────────────────────────────────────────────

function NotificationList({
  unreads,
  reads,
  onOpen,
}: {
  unreads: BasecampNotification[];
  reads: BasecampNotification[];
  onOpen: (n: BasecampNotification) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {unreads.length > 0 && (
        <>
          <SectionLabel text="New" />
          {unreads.map((n) => <NotificationRow key={n.id} notification={n} onOpen={onOpen} />)}
        </>
      )}
      {reads.length > 0 && (
        <>
          {unreads.length > 0 && <div className="divider" style={{ margin: '6px 0' }} />}
          <SectionLabel text="Earlier" />
          {reads.map((n) => (
            <div key={n.id} style={{ opacity: 0.6 }}>
              <NotificationRow notification={n} onOpen={onOpen} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--zen-tertiary-text)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
      {text}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--zen-secondary-text)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>
      <Bell size={22} style={{ color: 'var(--zen-tertiary-text)', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
      No new notifications. You're all caught up.
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--zen-tertiary-text)', fontSize: 'var(--text-sm)' }}>
      Loading...
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--zen-secondary-text)' }}>
        Couldn't load notifications.
      </div>
      <button className="btn btn-secondary" style={{ fontSize: 'var(--text-xs)' }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function DisabledState() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--zen-secondary-text)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>
      Notifications disabled. Enable in Settings.
    </div>
  );
}

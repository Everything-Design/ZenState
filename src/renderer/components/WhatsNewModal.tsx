import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { ReleaseHighlight } from '../../shared/whatsNew';

interface Props {
  highlight: ReleaseHighlight;
  onDismiss: () => void;
}

// v5.1.4 — Modal shown on first launch after an upgrade. Bullets are hand-
// authored per release in src/shared/whatsNew.ts. The user dismisses with
// "Got it" (or the × / Esc) and the version is recorded so we don't show
// it again until the next upgrade.
export default function WhatsNewModal({ highlight, onDismiss }: Props) {
  // Esc to dismiss — consistent with the rest of our modals.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '18px 20px 12px',
          borderBottom: '1px solid var(--zen-divider)',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(0, 122, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--zen-primary)',
            flexShrink: 0,
          }}>
            <Sparkles size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              {highlight.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--zen-tertiary-text)', marginTop: 1 }}>
              Version {highlight.version}
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--zen-tertiary-text)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
          fontSize: 'var(--text-sm)',
          lineHeight: 1.55,
          color: 'var(--zen-text)',
        }}>
          {highlight.intro && (
            <div style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--zen-secondary-text)',
              marginBottom: 14,
            }}>
              {highlight.intro}
            </div>
          )}
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {highlight.bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--zen-primary)',
                  marginTop: 8,
                  flexShrink: 0,
                }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {(highlight.footer || highlight.footerLink) && (
            <div style={{
              fontSize: 11,
              color: 'var(--zen-tertiary-text)',
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid var(--zen-divider)',
            }}>
              {highlight.footer && <span>{highlight.footer} </span>}
              {highlight.footerLink && (
                <button
                  type="button"
                  onClick={() => {
                    (window as unknown as { zenstate: { openExternal: (url: string) => Promise<unknown> } })
                      .zenstate.openExternal(highlight.footerLink!.url)
                      .catch((err: unknown) => console.warn('[whatsNew] openExternal failed:', err));
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--zen-primary)',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  {highlight.footerLink.label}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--zen-divider)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            className="btn btn-primary"
            onClick={onDismiss}
            autoFocus
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

/**
 * v5.6.0 — Daily-hours progress ring.
 *
 * Renders an SVG circle whose stroke arc maps to `value` (0..1). Used by the
 * dashboard Plan header and the popover footer to show today's tracked time
 * against the user's configured `dailyHoursTarget` (default 8h).
 *
 * Colour stages:
 *   < 0.5  — muted secondary text (not enough yet)
 *   0.5-1  — Zen primary blue (on track)
 *   >= 1   — Status-available green (target hit)
 *
 * Hover/focus shows the full label in a tooltip via `title`. We keep the
 * component prop-light; consumers compose the surrounding label/legend.
 */
export interface ProgressRingProps {
  /** 0..1 progress. Values > 1 still render as full (capped). */
  value: number;
  /** Outer diameter in pixels. Default 32. */
  size?: number;
  /** Stroke thickness. Default 3. */
  strokeWidth?: number;
  /** Optional centred label text (e.g. "5h 30m"). */
  label?: string;
  /** Title for native tooltip. */
  title?: string;
}

export default function ProgressRing({
  value,
  size = 32,
  strokeWidth = 3,
  label,
  title,
}: ProgressRingProps) {
  const safeValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeValue);

  const color =
    safeValue >= 1
      ? 'var(--status-available, #34c759)'
      : safeValue >= 0.5
        ? 'var(--zen-primary, #0a84ff)'
        : 'var(--zen-tertiary-text, rgba(255,255,255,0.4))';

  return (
    <div
      title={title}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--zen-divider, rgba(255,255,255,0.10))"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 320ms ease, stroke 320ms ease' }}
        />
      </svg>
      {label && (
        <span
          style={{
            position: 'absolute',
            fontSize: size <= 28 ? 8 : 9,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            color: 'var(--zen-secondary-text, rgba(255,255,255,0.65))',
            pointerEvents: 'none',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/** Helper: format seconds → "Xh Ym" for the ring label. */
export function formatRingLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

import React, { useEffect, useRef, useState } from 'react';

// v5.7.1 — Shared avatar image renderer that knows how to handle animated GIFs
// gracefully. PNG/JPG and the local user's own avatar always render as a plain
// `<img>` — animation is a non-issue for static formats, and freezing your own
// GIF would be needlessly surprising.
//
// For GIF avatars belonging to OTHER people, behaviour depends on the viewer's
// `animateAvatars` setting (default OFF):
//   - setting=ON  → `<img>` directly; the browser plays the GIF natively.
//   - setting=OFF → decode the GIF in a hidden <img>, draw its first frame to
//     a <canvas>, and render the canvas. Looks identical to a still photo to
//     anyone who hasn't opted in to motion.
//
// The setting is fetched lazily on mount and kept in sync via the
// `settings:updated` IPC event so any Avatar instance updates without a prop
// drill from the page-level renderer.
//
// `data` is the raw base64 (no data: prefix) — the legacy contract preserved
// for back-compat with pre-v5.7.1 avatars. `mime` defaults to image/png.

export interface AvatarProps {
  data: string;
  mime?: string;
  isSelf?: boolean;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
}

// Module-level cache so multiple Avatar instances don't each do an IPC call.
let cachedAnimateAvatars: boolean | undefined;
const animateAvatarsListeners = new Set<(v: boolean) => void>();
let settingsSubscribed = false;

function applyAnimateAvatars(v: boolean) {
  if (cachedAnimateAvatars === v) return;
  cachedAnimateAvatars = v;
  animateAvatarsListeners.forEach((l) => l(v));
}

function ensureSettingsSubscription() {
  if (settingsSubscribed) return;
  settingsSubscribed = true;
  const zs = (window as unknown as { zenstate?: { getSettings?: () => Promise<{ animateAvatars?: boolean }>; on?: (ch: string, fn: (...a: unknown[]) => void) => () => void } }).zenstate;
  zs?.getSettings?.().then((s) => applyAnimateAvatars(!!s?.animateAvatars)).catch(() => {});
  zs?.on?.('settings:updated', (...args: unknown[]) => {
    const next = args[0] as { animateAvatars?: boolean } | undefined;
    applyAnimateAvatars(!!next?.animateAvatars);
  });
}

function useAnimateAvatars(): boolean {
  const [v, setV] = useState<boolean>(cachedAnimateAvatars ?? false);
  useEffect(() => {
    ensureSettingsSubscription();
    if (cachedAnimateAvatars !== undefined && cachedAnimateAvatars !== v) setV(cachedAnimateAvatars);
    const listener = (next: boolean) => setV(next);
    animateAvatarsListeners.add(listener);
    return () => { animateAvatarsListeners.delete(listener); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

export default function Avatar({ data, mime, isSelf, alt, style, className }: AvatarProps) {
  const animate = useAnimateAvatars();
  const resolvedMime = mime || 'image/png';
  const src = `data:${resolvedMime};base64,${data}`;
  const isGif = resolvedMime === 'image/gif';
  const shouldFreeze = isGif && !isSelf && !animate;

  if (!shouldFreeze) {
    return <img src={src} alt={alt ?? ''} style={style} className={className} draggable={false} />;
  }
  return <FrozenGif src={src} alt={alt ?? ''} style={style} className={className} />;
}

function FrozenGif({ src, alt, style, className }: { src: string; alt: string; style?: React.CSSProperties; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) { setFailed(true); return; }
        canvas.width = img.naturalWidth || 128;
        canvas.height = img.naturalHeight || 128;
        ctx.drawImage(img, 0, 0);
      } catch {
        setFailed(true);
      }
    };
    img.onerror = () => setFailed(true);
    img.src = src;
  }, [src, failed]);

  if (failed) {
    return <img src={src} alt={alt} style={style} className={className} draggable={false} />;
  }
  return <canvas ref={canvasRef} aria-label={alt} style={style} className={className} />;
}

import { Tray, Menu, nativeImage, BrowserWindow, app, screen } from 'electron';
import path from 'path';
import { User, AvailabilityStatus } from '../shared/types';

let tray: Tray | null = null;
let onClickCallback: (() => void) | null = null;
let onStatusChangeCallback: ((status: AvailabilityStatus) => void) | null = null;
let onOpenDashboardCallback: (() => void) | null = null;

const STATUS_ICON_MAP: Record<AvailabilityStatus, string> = {
  [AvailabilityStatus.Available]: 'tray-available.png',
  [AvailabilityStatus.Occupied]: 'tray-occupied.png',
  [AvailabilityStatus.Focused]: 'tray-focused.png',
  [AvailabilityStatus.Offline]: 'tray-offline.png',
};

// ── Icon loading ─────────────────────────────────────────────

function getIconsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons');
  }
  return path.join(__dirname, '../../build/icons');
}

// v5.1.4 — 1×1 transparent PNG fallback. Used when the real icon can't be
// loaded (missing extraResources, antivirus quarantine, wrong arch packaging).
// On Windows, `new Tray(emptyImage)` throws "Invalid HICON" — this prevents
// the throw at the cost of an invisible tray icon. The app still boots, the
// menu still works via right-click, and the failure is logged for triage.
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

function createTrayIcon(status: AvailabilityStatus = AvailabilityStatus.Available): Electron.NativeImage {
  const filename = STATUS_ICON_MAP[status] || STATUS_ICON_MAP[AvailabilityStatus.Offline];
  const iconPath = path.join(getIconsDir(), filename);
  let img = nativeImage.createFromPath(iconPath);

  // v5.1.4 — Fallback to a non-empty image when the real icon failed to load.
  // Calling new Tray(emptyImage) on Windows throws "Invalid HICON" and kills
  // the app before any safety net can recover.
  if (img.isEmpty()) {
    console.warn(`[tray] Icon load failed (path: ${iconPath}); falling back to 1x1 transparent.`);
    img = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
  }

  if (process.platform === 'darwin') {
    img = img.resize({ width: 18, height: 18 });
  } else {
    img = img.resize({ width: 16, height: 16 });
  }
  img.setTemplateImage(false);
  return img;
}

// ── Time formatting ───────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Tray creation ─────────────────────────────────────────────

interface TrayCallbacks {
  onClick: () => void;
  onStatusChange: (status: AvailabilityStatus) => void;
  onOpenDashboard: () => void;
}

export function createTray(callbacks: TrayCallbacks) {
  onClickCallback = callbacks.onClick;
  onStatusChangeCallback = callbacks.onStatusChange;
  onOpenDashboardCallback = callbacks.onOpenDashboard;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  // Prevent garbage collection on some systems by pinning to global
  (global as any).__zenstateTray = tray;
  tray.setToolTip('ZenState');

  tray.on('click', () => {
    onClickCallback?.();
  });

  // v5.1.4 — Windows fires `'double-click'` (not two `'click'`) when the user
  // rapidly double-clicks the tray. Without this handler, Windows users who
  // double-click the icon (a natural Windows reflex from Start Menu launching)
  // get no response. Mac's tray emits 'click' for both single and double
  // clicks, so this only matters on Windows.
  if (process.platform !== 'darwin') {
    tray.on('double-click', () => {
      onClickCallback?.();
    });
  }

  // Right-click context menu with wired actions
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '● Available',
      click: () => onStatusChangeCallback?.(AvailabilityStatus.Available),
    },
    {
      label: '● Occupied',
      click: () => onStatusChangeCallback?.(AvailabilityStatus.Occupied),
    },
    {
      label: '● Focused',
      click: () => onStatusChangeCallback?.(AvailabilityStatus.Focused),
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => onOpenDashboardCallback?.(),
    },
    { type: 'separator' },
    // v5.3 — Explicit click instead of `role: 'quit'`. `role` bypasses our
    // `before-quit` `setClosable(true)` hotfix in some Windows builds; an
    // explicit `app.quit()` always routes through it.
    { label: 'Quit ZenState', click: () => app.quit() },
  ]);

  tray.on('right-click', () => {
    tray?.popUpContextMenu(contextMenu);
  });
}

// ── Update tray icon + title ──────────────────────────────────

export function updateTrayIcon(user: User, timerElapsed: number = 0, timerRunning: boolean = false) {
  if (!tray) return;

  const icon = createTrayIcon(user.status);
  tray.setImage(icon);

  // tray.setTitle() is macOS-only
  if (process.platform === 'darwin') {
    if (timerRunning && timerElapsed > 0) {
      tray.setTitle(` ${formatTime(timerElapsed)}`, { fontType: 'monospacedDigit' });
    } else {
      tray.setTitle('');
    }
  }

  tray.setToolTip(`ZenState — ${user.name} (${user.status})`);
}

// ── Position popover below tray ───────────────────────────────

export function positionPopover(window: BrowserWindow) {
  if (!tray) return;

  const trayBounds = tray.getBounds();
  const windowBounds = window.getBounds();

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  let y: number;
  if (process.platform === 'darwin') {
    // macOS: tray at top → open below
    y = Math.round(trayBounds.y + trayBounds.height);
  } else {
    // Windows/Linux: tray at bottom → open above
    y = Math.round(trayBounds.y - windowBounds.height);
  }

  // v5.1.4 — Clamp to the work area of the display the tray icon lives on.
  // Without this, multi-monitor and left-edge-taskbar Windows configurations
  // (and macOS setups with a secondary monitor to the left of primary) can
  // produce negative or off-screen coordinates, so the popover opens
  // invisibly off the edge — looks like "tray click did nothing." Mirrors
  // the pattern used by createMiniTimerWindow.
  try {
    const display = screen.getDisplayMatching(trayBounds) ?? screen.getPrimaryDisplay();
    const wa = display.workArea;
    // Leave an 8px breathing margin from the work-area edges.
    const margin = 8;
    const minX = wa.x + margin;
    const maxX = wa.x + wa.width - windowBounds.width - margin;
    const minY = wa.y + margin;
    const maxY = wa.y + wa.height - windowBounds.height - margin;
    if (Number.isFinite(maxX) && maxX > minX) {
      x = Math.max(minX, Math.min(x, maxX));
    }
    if (Number.isFinite(maxY) && maxY > minY) {
      y = Math.max(minY, Math.min(y, maxY));
    }
  } catch (err) {
    console.warn('[tray] positionPopover work-area clamp failed; falling back to raw position:', err);
  }

  window.setPosition(x, y);
}

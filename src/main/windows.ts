import { BrowserWindow, shell } from 'electron';
import path from 'path';

const isMac = process.platform === 'darwin';

// v5.5.0 — Security hardening (Electronegativity LIMIT_NAVIGATION_GLOBAL_CHECK).
// Apply to every BrowserWindow we create. Two protections:
//   1. setWindowOpenHandler returns `deny` so any `window.open` call from a
//      compromised renderer cannot spawn a new BrowserWindow under our
//      privileged preload. Trusted external URLs route through
//      `shell.openExternal()` via the `openExternal` IPC channel (validated
//      to http/https).
//   2. `will-navigate` is blocked for any URL outside the renderer's own
//      file:// or dev-server origin — prevents a renderer from being
//      hijacked into navigating to an attacker-controlled URL.
function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Optional: route safe http(s) URLs to the system browser. We already
    // do this via the explicit `app:open-external` IPC, so block here.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch(() => { /* best-effort */ });
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://localhost:5173');
    if (!allowed) e.preventDefault();
  });
}

export function createPopoverWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    transparent: isMac,
    // `type: 'panel'` makes this an NSPanel on macOS — non-activating so it
    // doesn't steal focus from the underlying app, and it floats correctly
    // over full-screen Spaces (hover-to-dismiss bug fix).
    ...(isMac ? { type: 'panel' as const } : {}),
    ...(isMac
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : { backgroundColor: '#1c1c1e' }),
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // v5.1.4 — `setAlwaysOnTop('screen-saver')` now applies on BOTH platforms.
  // Previously this entire block was Mac-only, leaving the popover on Windows
  // as a plain BrowserWindow with no z-order promotion — it opened behind
  // fullscreen apps and lost focus instantly.
  win.setAlwaysOnTop(true, 'screen-saver');
  // v5.3.4 — `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
  // is intentionally NOT called here at creation. Per Electron issue #31538,
  // `visibleOnFullScreen: true` hides the macOS Dock icon as a documented
  // side effect of the `NSWindowCollectionBehaviorFullScreenAuxiliary` flag.
  // togglePopover() applies this flag on every show and immediately
  // restores `setActivationPolicy('regular')` to counter the side effect.
  // Setting it at creation time would hide the Dock icon BEFORE any restore
  // could run — leaving the app permanently dock-iconless.

  win.loadURL(url);

  // Open DevTools in dev mode for debugging
  if (!require('electron').app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // v5.1.4 — Hide-on-blur with three layers of protection:
  //   1. Grace window after show() — covers macOS Space transitions that
  //      briefly fire blur during the animation (M-series with Reduce Motion
  //      off can take up to ~750ms; Intel HiDPI can exceed 1s). Bumped from
  //      500ms to 800ms based on field reports.
  //   2. Dashboard-focused exception — if the user clicked into our own
  //      dashboard window, that's a legitimate focus change. Don't hide; the
  //      user came from the popover to a related app surface and may come
  //      back. Without this, the v5.1.1-added "open dashboard on launch"
  //      could steal focus from a just-shown popover and immediately hide it.
  //   3. Dev-mode skip — devtools focus would otherwise hide the popover
  //      mid-debug.
  const BLUR_GRACE_MS = 800;
  let lastShownAt = 0;
  win.on('show', () => { lastShownAt = Date.now(); });
  win.on('blur', () => {
    if (!require('electron').app.isPackaged) return; // devtools focus in dev
    if (Date.now() - lastShownAt < BLUR_GRACE_MS) return;
    // Walk our own BrowserWindows: if the dashboard or mini-timer is now
    // focused, the user is interacting with our own app — not "outside" —
    // so don't dismiss the popover.
    const ownWindows = BrowserWindow.getAllWindows();
    const focusedIsOwn = ownWindows.some((w) => {
      if (w === win || w.isDestroyed() || !w.isFocused()) return false;
      try {
        const url = w.webContents?.getURL() || '';
        return url.includes('mini-timer.html');
      } catch {
        return false;
      }
    });
    if (focusedIsOwn) return;
    win.hide();
  });

  hardenWindow(win);
  return win;
}

export function createDashboardWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 800,
    minHeight: 600,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : { backgroundColor: '#1c1c1e' }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL(url);

  // Open DevTools in dev mode for debugging
  if (!require('electron').app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  hardenWindow(win);
  return win;
}

// A small frameless pill that floats above all other windows — including
// full-screen apps — so the user always sees whether their timer is running.
// `type: 'panel'` is critical here: regular BrowserWindows on macOS don't
// reliably stay above full-screen Spaces even with `setVisibleOnAllWorkspaces`
// + `screen-saver` level. NSPanel does. The opaque CSS background in
// mini-timer.html acts as a fallback so the panel renders reliably even
// before React mounts (the documented edge case for transparent panels).
export function createMiniTimerWindow(url: string, position?: { x: number; y: number }): BrowserWindow {
  const width = 240;
  const height = 36;
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // explicit ARGB so transparent compositing is reliable
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    paintWhenInitiallyHidden: true,
    closable: false,
    ...(isMac ? { type: 'panel' as const } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isMac) {
    // Stay visible across Spaces and over full-screen apps. The order matters:
    // setVisibleOnAllWorkspaces first, then bump the always-on-top level.
    // v5.5.0 — `skipTransformProcessType: true` prevents the dock-hide side
    // effect (Electron issue #31538). Same fix we applied to the popover in
    // v5.4.1 — the pill had been carrying the unfixed pattern.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setAlwaysOnTop(true, 'screen-saver');
  } else {
    // 'screen-saver' is also the highest standard level on Windows — without
    // it the pill won't sit above full-screen exclusive apps (presentations,
    // games). Electron documents this argument as cross-platform.
    win.setAlwaysOnTop(true, 'screen-saver');
  }

  // Default position: top-right of primary display, 60px below the work area
  // top edge so it clears the menu bar and notch area on MacBooks.
  // If a saved position is supplied, validate it lies inside *some* current
  // display's work area — common Windows scenario: pill was on a secondary
  // monitor that's no longer connected, so the saved coordinates would spawn
  // it off-screen.
  const { screen } = require('electron');
  const computeDefaultPos = () => {
    const display = screen.getPrimaryDisplay();
    return {
      x: display.workArea.x + display.workArea.width - width - 20,
      y: display.workArea.y + 60,
    };
  };
  const isPositionVisible = (x: number, y: number): boolean => {
    return screen.getAllDisplays().some((d: { workArea: { x: number; y: number; width: number; height: number } }) => {
      const wa = d.workArea;
      // Require the entire pill rect to fit, not just a corner.
      return x >= wa.x && y >= wa.y && (x + width) <= (wa.x + wa.width) && (y + height) <= (wa.y + wa.height);
    });
  };
  if (position && isPositionVisible(position.x, position.y)) {
    win.setPosition(position.x, position.y);
  } else {
    const def = computeDefaultPos();
    win.setPosition(def.x, def.y);
  }

  win.loadURL(url);
  hardenWindow(win);
  return win;
}

export function createAlertWindow(url: string, options: { width: number; height: number }): BrowserWindow {
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    show: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    closable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // v5.3 — Only mac honours this; on Windows it's a no-op that emits a
  // console warning, polluting our renderer/main logs.
  if (isMac) win.setVisibleOnAllWorkspaces(true);

  // Center on screen (offset up slightly like the Swift version)
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.bounds.width / 2 - options.width / 2);
  const y = Math.round(display.bounds.height / 2 - options.height / 2 - 100);
  win.setPosition(x, y);

  win.loadURL(url);
  hardenWindow(win);
  return win;
}

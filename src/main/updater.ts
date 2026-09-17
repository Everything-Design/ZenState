import { autoUpdater } from 'electron-updater';
import { autoUpdater as nativeUpdater, BrowserWindow, dialog } from 'electron';

let updateReady = false;
let downloadedInfo: { version: string } | null = null;

function updateErrorMessage(err: unknown): string {
  const message = (err as Error)?.message ?? String(err);
  console.warn('ZenState updater:', err);
  if (/latest(?:-mac|-linux)?\.yml/i.test(message) && /404|cannot find/i.test(message)) {
    return 'The latest release is missing update files for your system. Please try again after the release is corrected. Time recording is unaffected.';
  }
  if (/ENOTFOUND|ECONN|ETIMEDOUT|ERR_NETWORK|ERR_INTERNET|network|offline/i.test(message)) {
    return 'Could not reach the update server. Check your connection and try again. Time recording is unaffected.';
  }
  if (/checksum|signature|code.?sign/i.test(message)) {
    return 'The update could not be verified and was not installed. Please try again later.';
  }
  return 'The update could not be completed. Please try again later. Time recording is unaffected.';
}

function broadcast(channel: string, payload?: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try { win.webContents.send(channel, payload); }
    catch (err) { console.warn(`updater: broadcast to ${channel} failed:`, err); }
  }
}

function announceReady(info: { version: string }) {
  updateReady = true;
  broadcast('update:downloaded', { version: info.version });
}

export function setupUpdater(onBeforeInstall: () => void = () => {}) {
  // Test builds may advance to a newer stable release, never another test
  // release or an older version. Setting channel implicitly enables
  // downgrades in electron-updater, so reset that flag afterwards.
  autoUpdater.channel = 'latest';
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  nativeUpdater.on('before-quit-for-update', onBeforeInstall);
  nativeUpdater.on('update-downloaded', () => {
    if (process.platform === 'darwin' && downloadedInfo) announceReady(downloadedInfo);
  });
  autoUpdater.on('checking-for-update', () => broadcast('update:checking'));
  autoUpdater.on('update-available', info => broadcast('update:available', { version: info.version }));
  autoUpdater.on('update-not-available', info => broadcast('update:not-available', { version: info?.version }));
  autoUpdater.on('download-progress', progress => broadcast('update:progress', {
    percent: Math.round(progress.percent ?? 0), bytesPerSecond: progress.bytesPerSecond ?? 0,
    transferred: progress.transferred ?? 0, total: progress.total ?? 0,
  }));
  autoUpdater.on('update-downloaded', info => {
    downloadedInfo = info;
    // On macOS this event precedes Squirrel fetching and verifying its ZIP.
    // Only the native event means Restart is safe to offer.
    if (process.platform !== 'darwin') announceReady(info);
  });
  autoUpdater.on('error', err => broadcast('update:error', { message: updateErrorMessage(err) }));

  const check = () => autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.warn('Background update check failed:', err);
  });
  void check();
  setInterval(() => { void check(); }, 4 * 60 * 60 * 1000);
}

export async function checkForUpdate(): Promise<{ updateAvailable: boolean; version?: string; error?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) return { updateAvailable: false };
    // Reuse the updater's semver, platform and rollout decision. Splitting
    // versions into numbers breaks prereleases and stable transitions.
    void result.downloadPromise?.catch(() => { /* surfaced by update:error */ });
    return { updateAvailable: result.isUpdateAvailable, version: result.updateInfo.version };
  } catch (err) {
    const error = updateErrorMessage(err);
    broadcast('update:error', { message: error });
    return { updateAvailable: false, error };
  }
}

export function installUpdate(blockReason: string | null): void {
  if (blockReason || !updateReady) {
    const message = blockReason ?? 'The update is not ready to install yet.';
    broadcast('update:error', { message });
    // The restart banner also exists outside Settings, so a renderer-only
    // error listener is insufficient feedback for a blocked restart.
    void dialog.showMessageBox({ type: 'info', title: 'ZenState update', message, buttons: ['OK'] }).catch(() => {});
    return;
  }
  try { autoUpdater.quitAndInstall(); }
  catch (err) { broadcast('update:error', { message: updateErrorMessage(err) }); }
}

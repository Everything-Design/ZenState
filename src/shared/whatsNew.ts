// User-facing release highlights shown in the What's-New modal that pops on
// first launch after an upgrade. Hand-authored per release — keep tone short,
// concrete, and focused on what changed for the *user*, not engineers.
// "Under the hood" bits belong in .v5.x.y-release-notes.md, not here.
//
// Add a new entry for every release. The modal looks up the highlight whose
// `version` matches `app.getVersion()`; if there's no match, it doesn't show
// (e.g. on the very first install where the user has nothing to compare against).

export interface ReleaseHighlight {
  version: string;          // exact match against package.json's version
  title: string;            // short, e.g. "Smarter pinning, fewer surprises"
  intro?: string;           // optional one-line summary above the bullets
  bullets: string[];        // user-facing changes — keep each under ~120 chars
  footer?: string;          // optional closing line — plain text
  // Optional inline link rendered alongside the footer text. Modal opens it
  // via window.zenstate.openExternal (system browser, http(s)-only validated).
  footerLink?: { label: string; url: string };
}

export const RELEASE_HIGHLIGHTS: ReleaseHighlight[] = [
  {
    version: '5.1.4',
    title: "What's new in v5.1.4",
    intro: 'A grab-bag of reliability fixes plus three features you asked for.',
    bullets: [
      'Notes now follow the task. Type a note timing one to-do, switch to another, switch back — your note is right where you left it.',
      'Timesheet rows show your notes inline. Click any note to expand the full text.',
      "Meeting mode keeps the timer running through sleep. Walk to a conference room, close the lid — when you come back, your time is still being recorded. Just toggle Meeting on first.",
      "Pinning a to-do twice no longer 'duplicates' it in the picker. The same task you already pinned is now correctly hidden.",
      "Two pinned to-dos with the same name (e.g. 'Edit' from two different lists) no longer both light up as running when you start one.",
      'The popover behaves on Windows now. It stays above fullscreen apps, opens reliably on multi-monitor and left-edge-taskbar setups, and responds to double-clicks.',
      "Windows: a few users had the app silently not opening. Multiple silent-fail paths are now logged or recoverable. If you were stuck, this should fix it after a manual reinstall.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
];

// Helper: look up by version. Returns null if no entry exists for that version
// (e.g. v5.1.3 → no entry below 5.1.4 → modal doesn't show).
export function getHighlightForVersion(version: string): ReleaseHighlight | null {
  return RELEASE_HIGHLIGHTS.find((h) => h.version === version) ?? null;
}

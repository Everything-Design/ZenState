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
    version: '5.4.0',
    title: "What's new in v5.4.0",
    intro: 'Card Tables now show up in the picker — plus a stack of macOS lifecycle fixes from v5.3.5/.6.',
    bullets: [
      "Card Tables are pinnable. Browse a project that uses a Card Table → it appears as a list. Click it → all non-Done cards show up flat, ready to pin and track time on. Cards work identically to to-dos from there.",
      "Search + My Todos tabs now surface cards too — full parity with todos.",
      'Idle prompt has a proper "Stop now" button. Previously the only way to stop was "Walked away" which back-dated to last activity, sometimes recording 0 minutes. Stop now logs whatever the pill is showing.',
      '"Restart to update" actually restarts now. Earlier the menu-bar-app quit handler was blocking every explicit quit, so updates would download but never install.',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.3.4',
    title: "What's new in v5.3.4",
    intro: 'Search, multi-list, completed-to-bottom, and a stack of lifecycle fixes.',
    bullets: [
      "Search bar on Today's plan and inside the pill — type to filter when you've got a lot pinned.",
      "Projects with multiple to-do lists now surface ALL of them. Previously some lists were invisible.",
      "Completed tasks drop to the bottom of Today's list instead of staying in place.",
      "The pill now shows the project name above Notes when expanded — no more confusion when projects share task names.",
      "Windows: closing the dashboard now minimizes to the taskbar instead of vanishing. Click the taskbar button to restore.",
      "macOS: the Dock icon now stays visible reliably, and clicking it reopens the dashboard like a normal Mac app.",
      "Search input auto-focuses when you expand the pill. Press Escape on the dashboard search to clear instantly.",
      "Background polish: cleaner quit on Windows, no popover stragglers after sign-out, fewer log warnings.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
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

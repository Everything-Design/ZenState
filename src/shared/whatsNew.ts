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
    version: '5.8.1',
    title: "What's new in v5.8.1",
    intro: 'Intel Mac support — ZenState now ships an x64 build alongside the existing Apple Silicon (arm64) build. If you’re on a 2019-era MacBook Pro or earlier (Intel), the auto-updater will start pulling the right binary for your chip on the next check.',
    bullets: [
      'New x64 build target for Intel Macs. The dmg + zip + blockmap are produced for both architectures every release.',
      'Apple Silicon users see no change — auto-updater picks the matching binary based on your chip.',
      'No code changes vs v5.8.0. Pure build-config expansion.',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.8.0',
    title: "What's new in v5.8.0",
    intro: 'New Team time tab in the dashboard — pick a teammate, see what they’ve been working on across your pinned projects. Only Basecamp account admins see the tab; everyone else doesn’t even know it exists.',
    bullets: [
      'New "Team time" tab in the left dashboard nav. Only visible to people Basecamp lists as account admins.',
      'Pick a teammate from the dropdown → see their recent timesheet entries with the to-do they were working on, the project it belongs to, and the date / hours.',
      'Period filter (today / this week / this month / all time) narrows what shows.',
      'Scope = your pinned projects, so the data set stays predictable. Refresh button pulls fresh entries from Basecamp on demand.',
      'Live admin-role check on launch via BC’s /my/profile.json — if you stop being an admin, the tab disappears next launch. No setting to bypass.',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.5',
    title: "What's new in v5.7.5",
    intro: "Repackaging release — v5.7.4's mac publish died mid-upload to a DNS hiccup, leaving the release entry in a partial state with mismatched shas. v5.7.5 ships cleanly with the same fixes.",
    bullets: [
      "Windows: popover scrollbar is now thin and overlay-style, so the right edge no longer looks crammed when today's list overflows. Left and right padding are visually symmetric again.",
      "Windows: hardened the installer artifact name so the auto-update sha512 stops drifting between releases. Pinned to ZenState-Setup-${version}.exe via electron-builder config.",
      "No Mac-visible changes vs v5.7.3.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.4',
    title: "What's new in v5.7.4",
    intro: "Windows popover framing now has even padding on left and right (the system scrollbar isn't crowding the right edge anymore), and the auto-update pipeline is locked down so it stops desyncing.",
    bullets: [
      "Windows: popover scrollbar is now thin and overlay-style, so the right edge no longer looks crammed when today's list overflows. Left and right padding are visually symmetric again.",
      "Windows: hardened the Windows installer artifact name so the auto-update sha512 stops drifting between releases. Pinned to ZenState-Setup-${version}.exe via electron-builder config.",
      "No Mac-visible changes.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.3',
    title: "What's new in v5.7.3",
    intro: "Fix for a serious Windows-only popover bug. Multi-clicking the tray icon was making the popover shrink a few pixels each time — eventually clipping content and looking broken. Now stays at its full size, every time.",
    bullets: [
      "Windows: popover no longer shrinks on repeated tray clicks. Used to lose a few pixels per show due to a frame:false + HiDPI scaling round-trip; size is now re-asserted from a fixed constant on every show.",
      "Windows: content that was getting clipped at the edges of the popover should now be fully visible.",
      "No change for macOS users — same behaviour as v5.7.2.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.2',
    title: "What's new in v5.7.2",
    intro: "Repackaging release — Windows auto-update was failing with sha512 checksum mismatch on v5.7.0 and v5.7.1 because the publish pipeline ran twice and the second run desynced latest.yml against the actual installer. v5.7.2 ships once, cleanly. No new app features.",
    bullets: [
      "Fixes Windows auto-update sha512 verification — users stuck on v5.6.x / v5.7.0 / v5.7.1 can now update successfully.",
      "No functional changes vs v5.7.1.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.1',
    title: "What's new in v5.7.1",
    intro: "Animated GIF avatars (if you want them). Pick a GIF in Settings → Avatar and it stays animated for anyone who's opted in to motion. Everyone else sees a still first frame — the calm default stays calm.",
    bullets: [
      'GIF avatars now keep their animation through the LAN (previously Electron flattened them to a static PNG silently).',
      'Settings → General → "🎞️ Animate teammates\' GIF avatars" toggle controls whether you see them play. Off by default; flip it on for the fun.',
      'Capped at 500KB to keep the LAN broadcast reasonable. Larger GIFs get a friendly nudge.',
      'Square crop is skipped for GIFs (we don\'t bundle a re-encoder) — non-square sources render with object-fit: cover.',
      'Your own avatar always animates for you, regardless of the setting.',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.7.0',
    title: "What's new in v5.7.0",
    intro: "Folders + drag-to-reorder. Organise your pinned to-dos by project (automatic) or with your own custom folders, and rearrange them by dragging — on both the dashboard and the popover.",
    bullets: [
      'Pinned to-dos are now grouped by Basecamp project automatically. Each group has a collapsible header — click to fold up the ones you’re not focused on right now.',
      'Create your own folders too (e.g. "This week", "Standing items"). Hit "+ New folder" at the bottom of the Plan tab and drag items in.',
      'Drag tasks to reorder within a folder, drag them between folders, or drag the folder headers themselves to change the section order. Works on Plan tab and the popover.',
      'Pill switcher reflects the new order — read-only, no drag handles there.',
      'Restart-to-update is fixed (regression from the Electron 33→42 upgrade in v5.6.0). After you’re on v5.7.0, every future update will restart cleanly.',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.6.3',
    title: "What's new in v5.6.3",
    intro: 'Project names now appear under each task in the Plan tab’s "What you did today" list and the Timesheet tab’s session rows — so you can tell at a glance which project a tracked entry belongs to.',
    bullets: [
      'Project name shown under the task name in "What you did today" (Plan tab).',
      'Project name shown under the task name in "Today’s Sessions" and any selected-day detail view (Timesheet tab).',
      'Works for any session on a still-pinned to-do. Sessions on un-pinned to-dos show no project line (gracefully omitted).',
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.6.2',
    title: "What's new in v5.6.2",
    intro: 'Timesheet entries land on the right day, the heads-up alert has a softer sound, and the daily-progress ring is back.',
    bullets: [
      "Sessions stopped near midnight now post to Basecamp on the same day they appear under in ZenState. Previously a session stopped at 11:58pm and confirmed at 12:02am posted to today on BC while sitting under yesterday in your Timesheet.",
      "Deleting a session in the Timesheet tab refreshes every open surface immediately, even when the session had no Basecamp link.",
      "Discarding the 'Review before posting' popup also refreshes the dashboard, so the in-flight badge clears without waiting on the post-stop refresh.",
      "Heads-up alerts have a custom MP3 chime instead of the v5.5.0 two-tone synth — same alert behaviour, calmer sound.",
      "Daily-hours progress ring is back on the Plan tab. Hidden by default if you'd rather not see it — leave the target empty in Settings → Productivity.",
      "Pill: dot and stop button are now visually balanced. Small fix, looks cleaner.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.6.0',
    title: "What's new in v5.6.0",
    intro: 'Foundation upgrade + 4 sneaky bug fixes.',
    bullets: [
      "Faster dashboard: Team, Timesheet, and Settings tabs now lazy-load — opens the dashboard with only the Plan tab in the initial bundle.",
      "Pings respect meeting mode now. If your timer is running and meeting mode is on, incoming heads-ups skip the full-screen alert + chime (still saved to the popover for catch-up later).",
      "Stopwatch-add + meeting-toggle no longer creates ghost state. Four state-cancellation bugs the ECC click-path audit caught are fixed.",
      "Errors that used to vanish now show or log. The 'Also log time for' picker now shows a retry button when members fail to load (instead of looking empty). Notifications mark-read rolls back if it fails.",
      "Foundation: upgraded Electron 33 → 42 (9 majors of Chromium security patches). No code changes needed — clean upgrade. Bundles include 13 dependency security fixes from the npm audit cycle.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
  {
    version: '5.5.0',
    title: "What's new in v5.5.0",
    intro: 'Configurable thresholds, faster dashboard, security hardening, heads-up alerts now appear on screen with a soft chime.',
    bullets: [
      "Heads-up pings now appear as a center-screen alert (like meeting requests) with a soft two-note chime — no more missing them in the popover.",
      "Configurable thresholds: tune the 'Still working?' prompt timing (3h default) and the daily check-in hour (9am default) in Settings → General → Productivity.",
      "Dashboard plan list is dramatically smoother: every second of timer tick used to re-render every pinned row. Now it only re-renders rows that actually changed.",
      "macOS dock icon stays visible reliably — same fix from v5.4.1 is now applied to the mini-timer pill too.",
      "Security: external links from any window route through your default browser (can't be hijacked into the app).",
      "Storage: timesheet records now cap at 90 days; older entries auto-archive so the app stays snappy after a year of use.",
      "Cleared 13 dependency security advisories. Removed 1,385 lines of dead code.",
    ],
    footer: 'Got feedback?',
    footerLink: {
      label: 'Drop it in Basecamp',
      url: 'https://3.basecamp.com/5826042/buckets/38489884/cloud_files/9572235152',
    },
  },
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

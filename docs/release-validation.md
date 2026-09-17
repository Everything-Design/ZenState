# Desktop release validation

The current candidate is stable v5.8.4. Earlier test-build results below are historical. Do not publish individual platform files to a live release before the complete release set is verified.

## Automated checks

```sh
npm test
npx tsc --noEmit -p tsconfig.json
npm run build:renderer
npm run verify:release -- --complete dist/release-test/windows dist/release-test/mac dist/release-test/linux
```

Twenty-two automated tests pass locally. The tests cover weekly-allocation security and parsing, updater errors and readiness on all platform branches, stable-channel selection, no downgrade, restart blocking, Basecamp write tracking, local-record reload/edit/delete, retention of old unposted records, and rejection of corrupt/incomplete update manifests, missing platform directories, missing packaged apps, mixed versions, duplicate platforms, both Mac installer architectures, friendly missing-manifest errors, and the real main-process quit handler. They use isolated fixtures and do not post to Basecamp or use a person's local records.

The artifact verifier checks manifest versions, SHA-512 hashes, exact sizes, primary paths, required installer/update formats, compressed blockmap integrity and coverage, packaged main JavaScript syntax, preload and renderer entrypoints, tray resources, allocation chunk, equality with the tested compiled source, exclusion of credential files, and embedded GitHub update-feed identity, and bundled dependency versions against the tested lockfile.

The manually triggered `Validate desktop release` workflow runs the checks and builds Windows, macOS and Linux artifacts. It uploads CI artifacts only. A dependent job downloads all three platform outputs, verifies the complete set together, and creates a `verified-release-*` bundle only after every build passes. It replaces the previous workflow that appended Windows assets after a release was already public. Local changes must be committed/pushed before that workflow can run; it has not been triggered by this work.

## Auto-update requirements

- Stable channel: `latest`; test builds cannot follow other prereleases or downgrade. They can advance to a newer stable release.
- Windows x64: NSIS `.exe`, matching `.exe.blockmap`, and `latest.yml`.
- macOS: both Intel and Apple Silicon `.zip` update archives with blockmaps, `.dmg` installers and `latest-mac.yml` containing both architectures. DMG-only releases cannot service the Mac updater.
- Linux x64: `.AppImage`, `.deb`, and `latest-linux.yml`. Each package type uses its supported updater path; updating a system-installed .deb can prompt for administrator authorization.
- All platforms must use the same version and match their manifest checksums. Upload the complete set to a draft release first, verify its assets, then publish it atomically.
- Stable package.json version, Git tag and release version must match. These test builds override the package version at packaging time; the repository version has not been promoted.
- macOS Restart becomes available only after Squirrel has prepared the native update. A failed or premature install request must not force the app to exit.
- Both explicit update restart and normal Quit are blocked while a timer is running/paused, a time confirmation is pending or a Basecamp write is in flight. Blocked Quit keeps windows and networking alive and explains what to finish. This does not protect against forced termination or OS power loss.

## Internal office release policy and remaining verification

1. Windows builds are intentionally unsigned for internal office use. Confirm installation and updates on office PCs under the actual security policies; signature warnings are expected and must not be mistaken for a successful native update test.
2. Mac builds retain the existing Apple Development signing identity. Notarization is intentionally omitted for internal use. Verify both old and new signatures and perform a native update test; signing and notarization are different requirements. Changing the identity can break the existing update chain.
3. Install on real Windows x64, macOS Intel and Apple Silicon, and Linux x64. Check first launch, Basecamp browser OAuth callback, preload bridge, tray/dashboard reopen, notifications, settings, startup, shortcuts and mini timer. Test Linux X11 and Wayland if both are supported.
4. Record, pause/resume, stop and confirm a short test session; verify it persists after restart and appears once against the correct Basecamp person/project. Repeat while offline, then reconnect. Check lock, sleep/wake and app restart. These live writes require a deliberately chosen test project.
5. Run an actual installed-version-to-new-version update for each platform/package type using an isolated test feed or draft release and disposable profile. Verify check, download, checksum/signature verification, cancellation/error, restart, new version, retained settings, retained local time and retained Basecamp authentication. Unit tests cannot prove this native installation path.
6. Repeat update attempts while recording, paused, awaiting confirmation and posting; verify the recorder stays open with a clear message. Simulate network failure/corrupt download and confirm it never claims success or quits.
7. Check the final release's public URLs and all architecture-specific metadata before inviting the team to update. No release has been published by this work.

Historical test installers (.1–.6) remain on disk for traceability; they do not contain all .7 release safeguards and security patches and should not be distributed as the final release.

## Local verification results — 5.8.4-test.6

- All 19 automated tests and both TypeScript configurations passed; the renderer production build passed.
- Complete release-manifest validation passed for Windows x64, both Mac architectures and Linux x64. Each packaged app matches the tested compiled source, includes 4,653 archive entries, and points to the intended GitHub update feed.
- NSIS installer and its nested application archive, both Mac update ZIPs, the Debian payload and the AppImage filesystem passed archive-integrity checks. AppImage trailing data is its verified embedded update blockmap.
- The installed payload archives extracted from Windows NSIS, Linux AppImage, Debian and both Mac ZIPs match their verified packaged apps.
- Both DMG checksums and both Mac deep/strict code-signature checks passed. Mac builds are Apple Development signed and not notarized.
- Final Windows app and installer have no Authenticode certificate. They are unsigned test artifacts.
- No native Windows/Linux installation or installed-to-installed update test was performed. No public release was uploaded, changed or published.
- Artifacts, update metadata, checksums and machine-readable validation output are in `dist/release-test/`. These are historical .6 results; the current .7 results are recorded below.


## Release safeguards added in test.7

- Applied compatible dependency security updates; Electron is now 42.11.4, js-yaml 4.3.2 and fast-uri 3.1.8 in the lockfile. The full dependency audit reports zero known vulnerabilities as of 2026-09-17.
- Update errors now explain a missing platform release, connectivity failure, or failed verification without displaying HTTP headers and stack traces. Detailed errors remain in process logs.
- Normal Quit uses the same recording safeguards as Restart for update. It never stops or posts a session automatically. Idle quit still allows downloaded updates to install.
- All `dist` scripts explicitly use `--publish never`. Removed `publish` and `publish:win`; these shortcuts could publish a Mac-only or Windows-only release. No replacement command silently publishes.
- The verifier rejects empty platform directories, missing unpacked applications, duplicate manifests, mismatched versions, and missing Mac Intel/Apple Silicon ZIPs or DMGs. CI uses `--artifacts-only` only in its combined job, after each platform has separately checked its packaged app.
- Before publishing a stable release, run `npm run verify:release -- --complete --stable <windows-dir> <mac-dir> <linux-dir>`. This additionally requires the artifact version to equal the stable `package.json` version. Confirm the matching Git tag and that the version is newer than the public release. Keep the full release as a draft until all files and native tests are verified.

The public v5.8.3 release still needs a complete successor release to resolve Windows' missing `latest.yml`. Friendlier error text does not repair a missing published artifact. Nothing in this work publishes or changes that release.


## Local verification results — 5.8.4-test.7

- Final `npm run release:check` passed: all 22 automated tests, TypeScript checks, and complete cross-platform artifact verification. Renderer production build also passed.
- Full `npm audit` reports zero known vulnerabilities. Packaged dependency versions match the tested lockfile; the release uses Electron 42.11.4.
- Windows x64 NSIS, Linux x64 AppImage/Debian and both Mac architectures rebuilt. All four packaged apps contain 4,657 archive entries and match the tested compiled source. Manifests, blockmaps and checksums passed; `SHA256SUMS` covers the 15 current release files.
- Installer/archive integrity checks passed. Application archives extracted from Windows NSIS, Linux AppImage, Debian and both Mac ZIPs match the verified unpacked apps. Both Mac DMG checksums and deep/strict signature checks passed.
- Native Mac ARM runtime smoke passed against packaged application code using Electron 42.11.4 and a disposable profile: dashboard startup, actual sandbox preload, timer start/pause/resume/stop, normal Quit blocked while running or paused, and local session written to disk. The harness disables external updater checks. It did not read the user's profile, authorize Basecamp, or post time. This is not an installed-app upgrade test.
- Windows installers remain unsigned. Mac apps remain Apple Development signed, without Developer ID distribution signing or notarization. Native Windows/Linux and installed-to-installed updater tests are still outstanding.
- Evidence is in `dist/release-test/`: `checks.log`, `validation.json`, `dependency-audit.json`, `artifact-integrity.json`, `payload-verification.txt`, `mac-runtime-smoke.log`, the smoke harness, and `SHA256SUMS`.
- The CI workflow changes are local and have not been run on GitHub. Nothing has been committed, pushed or published by this work. Use .7 for further testing; do not treat these builds as a production release.


## Stable v5.8.4 release validation

The default `npm run release:check` now verifies the stable artifacts under `dist/release-<package version>/` and requires the manifests to match `package.json`. Explicit directory arguments remain available for test builds.

- All platform installers and update metadata have been built and uploaded together to an unpublished draft with the v5.8.4 release notes.
- Both Mac architectures passed signature verification and DMG checksums. All installer archive-integrity checks passed.
- A native Mac ARM test used isolated, re-signed copies with a separate bundle ID and disposable profile. The published v5.8.3 application code updated to v5.8.4, restarted, retained a local session and settings, and then updated successfully to a test-only next-version fixture. The test-only version is not a release artifact. The published v5.8.3 and candidate apps have matching production signing requirements.
- Native Windows validation installs published v5.8.2, downloads the exact candidate NSIS installer from the draft, performs a silent update, and checks restart, retained session/settings, and restored GitHub feed. A probe is injected only into the disposable baseline; the candidate installer is unmodified.
- Native Linux validation exercises both Debian and AppImage candidates against an isolated prerelease fixture under Xvfb. It checks installation, restart and retained records. Office security policies and interactive administrator prompts still depend on the target computer.
- GitHub draft downloads require push access. Only the native update-test jobs receive `contents: write` for that read; none of these workflows publishes releases.

See the GitHub workflow run results for the final pass/fail status. Source-level or fixture checks do not guarantee that every historical installation or future release can update; preserve the signing identity and complete manifests and repeat native update tests for each release.

### Final native validation and legacy test-channel migration

[Run 35215474465](https://github.com/Everything-Design/ZenState/actions/runs/35215474465) passed all seven jobs: the three OS builds, combined artifact verification, and native Windows, AppImage and Debian updates. The separate local Mac ARM native test passed both v5.8.3 → v5.8.4 and v5.8.4 → a test-only next-version fixture. No Intel Mac hardware test or live Basecamp write was performed.

Early 5.8.4-test clients infer a custom `test` update channel and cannot discover a stable release by themselves. The installed test.4 GitHubProvider implementation is byte-identical to the 6.8.9 provider used by `scripts/check-test-channel-bridge.cjs`. That script checks 60 platform/version/repository combinations using the real provider and writes three compatibility manifests. Their `version` is 5.8.4 and their `tag` is v5.8.4, so the provider resolves the exact verified stable files and hashes rather than requiring another build. Both the current repository name and the old ZenState_V3 alias are covered. The bridge tag v5.8.4-test.8 is an intentional metadata-only alias, not an application version.

Publish the complete stable release first, then the bridge as a prerelease with `--latest=false`. Never mark the bridge as latest. Run `node scripts/check-test-channel-bridge.cjs --live` after publication to verify actual discovery and download routing. Stable clients remain on v5.8.4; early test clients install v5.8.4 and subsequently follow stable updates. Future stable releases must continue shipping all three manifests and the matching complete artifact set.

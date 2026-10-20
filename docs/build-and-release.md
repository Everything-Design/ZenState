# Build and release ZenState

This is the repeatable build path for the current desktop app. As of v5.9.3, it produces macOS Apple Silicon and Intel DMG installers and ZIP update archives, a Windows x64 NSIS installer, and Linux x64 AppImage and Debian packages. Packaging commands use `--publish never`; they do not change the public update feed.

Application source and CI live in `Everything-Design/ZenState`. Installed v5.9.3 and newer apps get updates from the public, downloads-only `Everything-Design/ZenState-Releases` repository. Never push application source, source tags or source history to the downloads repository. See [the update migration](update-migration.md) before changing source visibility.

## Prepare the source

Use the release commit on `main` with a clean tracked working tree. For a new version, update `package.json` and `package-lock.json` together with `npm version X.Y.Z --no-git-tag-version`, then update `.vX.Y.Z-release-notes.md` and the in-app What's New text before committing and tagging `vX.Y.Z`. Use Node 22 to match GitHub CI.

Run these checks on the build machine:

```sh
npm ci
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
```

For a quick local installer on its native OS, run `npm run dist:mac`, `npm run dist:win`, or `npm run dist:linux`. These write to the default `dist/` directory. For a release, use the separate output directories below so packages from different versions cannot be mixed.

## Build on each OS

### macOS: Apple Silicon and Intel

Run on a Mac that has the **same Apple signing identity as the previous published release**. Check available identities with `security find-identity -v -p codesigning`. The current internal release uses Apple Development signing and is not notarized. An unsigned or differently signed Mac build can break automatic updates for existing installations.

```sh
version="$(node -p 'require("./package.json").version')"
npx electron-builder --mac dmg zip --arm64 --x64 --publish never "-c.directories.output=dist/release-$version/mac"
npm run verify:release -- "dist/release-$version/mac"
codesign --verify --deep --strict "dist/release-$version/mac/mac-arm64/ZenState.app"
codesign --verify --deep --strict "dist/release-$version/mac/mac/ZenState.app"
hdiutil verify "dist/release-$version/mac/ZenState-$version-arm64.dmg"
hdiutil verify "dist/release-$version/mac/ZenState-$version-x64.dmg"
```

Also verify the signatures of `ZenState.app` extracted from both ZIPs. Compare `codesign -d -r-` for the previous published app and both new apps; their designated requirements must match. Test an actual update from the previous signed version with a separate app identifier and disposable profile before release. This repository does not contain a maintained Mac upgrade harness, so record the test procedure and result for each release. Do not change the installed app or a person's real ZenState data for this test.

Expected release files: two DMGs, two ZIPs, their four `.blockmap` files, and `latest-mac.yml`. The ZIPs are required for Mac auto-update.

### Windows x64

Run in PowerShell on Windows. GitHub CI uses `windows-latest`; it is the preferred build source for the public Windows installer. The current internal Windows installer is unsigned.

```powershell
$version = node -p "require('./package.json').version"
npx electron-builder --win nsis --x64 --publish never "-c.directories.output=dist/release-$version/windows"
npm run verify:release -- "dist/release-$version/windows"
```

Expected release files: `ZenState-Setup-X.Y.Z.exe`, its `.blockmap`, and `latest.yml`.

### Linux x64

Run on Linux, preferably Ubuntu 22.04 as used by CI. Check first launch on the intended distribution and desktop environment as described in [Linux testing](linux-testing.md).

```sh
version="$(node -p 'require("./package.json").version')"
npx electron-builder --linux deb AppImage --x64 --publish never "-c.directories.output=dist/release-$version/linux"
npm run verify:release -- "dist/release-$version/linux"
```

Expected release files: `ZenState-X.Y.Z-amd64.deb`, `ZenState-X.Y.Z-x86_64.AppImage`, and `latest-linux.yml`.

Run `npm ci`, the tests, type check, and `npm run build` in each native checkout before the corresponding packaging command. The verifier above checks the unpacked app against that checkout's compiled source. Do not treat a Mac cross-build as a replacement for a native Windows or Linux build.

## Assemble a public release

Run these release commands in zsh/bash on the signing Mac. Start with `version="$(node -p 'require("./package.json").version')"` in each new shell.

1. Commit the tested version and release notes, create the annotated `vX.Y.Z` tag on that commit, and push both `main` and the tag. Check that the tag resolves to the intended release commit:

   ```sh
   git tag -a "v$version" -m "ZenState v$version"
   git push origin main
   git push origin "v$version"
   git rev-parse HEAD "v$version^{commit}"
   ```

   The two printed commit hashes must match at this point.

2. Start `.github/workflows/build-win.yml` from that tag with `installed_update=false`. It builds and verifies all three OS packages and a combined `verified-release-X.Y.Z` artifact:

   ```sh
   gh workflow run build-win.yml --ref "v$version" -f "version=$version" -f installed_update=false
   gh run watch RUN_ID --exit-status
   gh run download RUN_ID --name "zenstate-windows-$version" --dir "dist/release-$version/windows"
   gh run download RUN_ID --name "zenstate-linux-$version" --dir "dist/release-$version/linux"
   ```

   Use the signed local Mac packages from the exact tagged source. The Mac package built in CI is useful for build validation, but it does not carry this Mac's established signing identity.

3. Verify the assembled release. `--artifacts-only` is appropriate here because the downloaded CI artifacts omit their unpacked apps; each CI build job has already verified its own unpacked package. The local signed Mac build should separately pass the full verification command shown above.

   ```sh
   npm run verify:release -- --complete --stable --artifacts-only "dist/release-$version/windows" "dist/release-$version/mac" "dist/release-$version/linux"
   ```

4. Make `SHA256SUMS` for the 15 installer, blockmap, and update-manifest files, using filenames without platform directories. This excludes `builder-debug.yml`:

   ```sh
   release_dir="dist/release-$version"
   (
     cd "$release_dir"
     for file in windows/* mac/ZenState-"$version"-* mac/latest-mac.yml linux/*; do
       shasum -a 256 "$file" | sed 's#  .*/#  #'
     done | LC_ALL=C sort -k2
   ) > "$release_dir/SHA256SUMS"
   test "$(wc -l < "$release_dir/SHA256SUMS" | tr -d ' ')" = 15
   ```

   Create a GitHub **draft** release with the tag, title, and reviewed notes; upload those 15 files plus `SHA256SUMS`:

   ```sh
   gh release create "v$version" --draft --verify-tag --title "ZenState v$version" --notes-file ".v$version-release-notes.md"
   gh release upload "v$version" "dist/release-$version/windows/"* "dist/release-$version/mac/ZenState-$version-"* "dist/release-$version/mac/latest-mac.yml" "dist/release-$version/linux/"* "$release_dir/SHA256SUMS"
   ```

   Confirm the draft has exactly 16 assets and that GitHub's recorded size and SHA-256 digest match each local file. Keep it a draft while update tests run. If an upload is interrupted, retry the missing assets; `gh release upload --clobber` can replace a partially uploaded asset.

5. Run the same workflow from the tag with `installed_update=true`. It tests the exact draft Windows installer against the previous public version, and the exact draft AppImage and Debian packages against isolated earlier-version fixtures. Confirm all build, combined verification, and installed-update jobs pass. Separately confirm the signed Mac native update, including restart and retained local data.

   ```sh
   gh workflow run build-win.yml --ref "v$version" -f "version=$version" -f installed_update=true
   gh run watch RUN_ID --exit-status
   ```

6. Copy the verified 16 assets and release notes to a **draft** in `Everything-Design/ZenState-Releases`. Create its release tag from that repository's own `main` branch (which contains only its README), rather than pushing the application source tag:

   ```sh
   gh release create "v$version" --repo Everything-Design/ZenState-Releases --target main --draft --title "ZenState v$version" --notes-file ".v$version-release-notes.md"
   gh release upload "v$version" --repo Everything-Design/ZenState-Releases "dist/release-$version/windows/"* "dist/release-$version/mac/ZenState-$version-"* "dist/release-$version/mac/latest-mac.yml" "dist/release-$version/linux/"* "$release_dir/SHA256SUMS"
   ```

   Check all 16 sizes and SHA-256 digests against the source draft. Publish the downloads repository first, only after all checks pass:

   ```sh
   gh release edit "v$version" --repo Everything-Design/ZenState-Releases --draft=false --latest
   gh api repos/Everything-Design/ZenState-Releases/releases/latest --jq '{tag_name, draft, asset_count: (.assets | length)}'
   ```

   Confirm the latest tag is `vX.Y.Z`, all 16 public asset URLs return HTTP 200, and the public `latest.yml`, `latest-mac.yml`, and `latest-linux.yml` match the verified local files. Record the run IDs and results in [release validation](release-validation.md).

   For the v5.9.3 transition only, also publish the identical source-repository draft with `gh release edit "v$version" --repo Everything-Design/ZenState --draft=false --latest`. This lets existing installations discover the transition. Keep the source repository public until all team devices are confirmed on v5.9.3 or newer. Later source drafts can stay private staging releases for CI; the public downloads repository is the distribution destination.

## Final checklist

- [ ] Version, release notes, committed source, and Git tag agree.
- [ ] Tests, type check, and production build pass on each platform.
- [ ] Native Windows, signed Mac arm64/x64, and Linux x64 packages and manifests pass verification.
- [ ] Previous-to-new installed updates pass for Windows, Mac ARM, AppImage, and Debian with local data retained.
- [ ] Draft contains all 16 matching assets before it becomes public.
- [ ] Public latest release, updater manifests, and download URLs are checked after publication.

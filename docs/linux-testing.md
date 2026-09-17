# Linux x64 test build

For Intel/AMD machines running Ubuntu, Linux Mint or Debian. This is a test release; native Linux desktop behaviour still needs verification on the target system.

## Install (recommended: .deb)

From the directory containing the downloaded installer:

```sh
sudo apt install ./ZenState-5.8.4-test.7-amd64.deb
```

Open **ZenState** from the applications menu. Future test builds can be installed the same way. Do not run the application with sudo.

## Portable AppImage

```sh
chmod +x ZenState-5.8.4-test.7-x86_64.AppImage
./ZenState-5.8.4-test.7-x86_64.AppImage
```

Some distributions require their FUSE 2 compatibility package for AppImages. Ubuntu's newer AppArmor rules can also restrict portable Electron apps. Use the .deb installer if the AppImage reports a sandbox or user-namespace error; do not disable the sandbox.

## Linux-specific behaviour

- Closing the dashboard minimizes it so it remains accessible even without a tray extension. Use the tray menu's **Quit ZenState** action to exit when the tray is available.
- The tray menu uses Linux's registered context-menu mechanism. Tray visibility depends on the desktop environment.
- Configure automatic startup using the desktop's **Startup Applications** settings; the app's macOS/Windows login-item toggle is not available on Linux.
- Wi-Fi diagnostics are not implemented on Linux. Local peer discovery still uses the existing network service.
- Global shortcuts, idle detection, mini-timer placement and always-on-top behaviour need testing under both X11 and Wayland.
- This build has not been published to the automatic-update feed. Install test updates manually.
- Weekly allocation is a separate read-only sidebar tab. It never controls recording or posts time.

## First-device verification

1. Start the app, create your profile and authorize your own Basecamp account in the browser. Confirm the browser callback returns successfully.
2. Record a short, clearly labelled test task; pause, resume and stop it. Confirm the local record survives restarting ZenState.
3. Confirm the intended test entry posts once to Basecamp and appears against the correct person and project.
4. Open **Weekly allocation**, navigate past weeks and confirm saved planned hours. Newly posted time appears after the next Everything Ops import.
5. Temporarily disconnect the network and verify recording continues while the allocation view reports unavailable data.
6. Check the tray menu, dashboard reopen, notifications, mini timer, lock/unlock and suspend/resume. Record the distribution version and whether the session uses X11 or Wayland with any issue report.

The build was cross-compiled on macOS. Build/type checks and archive inspection are not a substitute for these Linux runtime checks.

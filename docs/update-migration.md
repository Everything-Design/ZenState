# Move automatic updates before making source private

## Destinations

- Application source, source tags and build/update-test workflows: `Everything-Design/ZenState`.
- Public installers, blockmaps, checksums and platform manifests: `Everything-Design/ZenState-Releases`.
- v5.9.2 and earlier installed apps query the source repository. v5.9.3 and later query the downloads repository, without a GitHub login or embedded token.

## Transition order

1. Build and validate v5.9.3, preserving the previous Mac signing identity.
2. Upload the same complete 16-asset set to drafts in both repositories. Tags in the downloads repository must point to its README-only history.
3. Complete native installed-update checks and verify the new packaged update destination.
4. Publish the downloads release first, then the source release. Verify anonymous manifests and download URLs in both repositories.
5. Confirm **every team device**, including offline/secondary machines, has installed v5.9.3 or newer. Use the version shown in Settings; release download counts do not prove migration. ZenState has no device-version inventory that establishes this automatically.
6. Only after that confirmation, make `Everything-Design/ZenState` private. Keep `Everything-Design/ZenState-Releases` public.

The source repository must remain public while migration is unconfirmed. Changing its visibility does not stop installed apps or remove their data, but older installations will lose automatic updates. Those devices can recover by manually installing the current version from the public downloads repository.

## Future releases

Follow [build and release](build-and-release.md). Use source-repository drafts as CI staging and publish all installer/update files to the downloads repository. No GitHub access token belongs in the installed app. Keep the application ID, updater cache name and Mac signing identity stable.

## Completion evidence

- Transition release publication and automated verification: recorded in [release validation](release-validation.md).
- Team device migration: pending confirmation; do not infer completion from successful build or publication.
- Source visibility change: pending team device confirmation.

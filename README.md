# BitChord Windows

An unofficial Windows x64 port of the **BitChord v1.9.1 web player**. Built with
Electron from upstream commit `7f45c768a461fd7e68bf4613f71e8a767e643d4c`.

**Experimental prerelease:** compilation and automated tests pass, but native
launch, live playback, and provider sign-in have not been verified. Windows
Device Guard blocked Electron in the build environment. This port does not yet
provide all features of the Android application.

## Download and run

Download the Windows portable ZIP from this repository's **Releases** page.
Extract the entire ZIP, then open **BitChord Windows.exe**. Keep the files next
to the executable. Node.js and a browser extension are not required.

The portable edition stores its profile in an adjacent `data` folder. Do not
include a used profile when sharing the app. The build is unsigned.

## Features

The v1.9.1 web player includes search, streaming audio/video, queues, playlists,
synced lyrics, crossfade, Automix, Spotify playlist matching, and a Listen
Together client. The extension's services are integrated into the desktop app.
Live service behavior and sign-in remain unverified in this port.

Listen Together requires a server address in Settings. Android-only USB/AAudio
output, system equalizer, offline downloads, local-library scanning, addons,
Wear OS, TV, Cast, and Android player themes are not ported.

## Build and verification

See [Windows build instructions](web/desktop/README.md) for setup, packaging,
architecture, and known limitations. The first build passed 159 upstream tests,
10 desktop policy/integration tests, TypeScript checks, and production builds.
Desktop integration tests use a mocked Electron host.

Upstream automation is preserved in
[`.github/upstream-workflows`](.github/upstream-workflows) and does not execute
in this repository. No upstream deployment credentials are needed.

## Credits and license

Based on [BitChord by kushagrasinghx and contributors](https://github.com/kushagrasinghx/BitChord),
released under [GPLv3](LICENSE). Original documentation is preserved in
[README.upstream.md](README.upstream.md). This is a community port, not an
official upstream Windows release. Electron and other dependencies retain their
own licenses. Include the corresponding source when redistributing this build.

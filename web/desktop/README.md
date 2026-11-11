# BitChord Windows — 1.9.1-desktop.1

Community Windows x64 port of the BitChord **v1.9.1 web player**, from commit
`7f45c768a461fd7e68bf4613f71e8a767e643d4c`. This is not an official upstream
Windows release and does not claim complete Android feature parity.

## Run

Extract the whole portable ZIP, then open **BitChord Windows.exe**. Keep all its
adjacent files and the resources folder. No Java, Node.js, or browser extension
is required. Internet is needed for streaming. The portable profile is saved in
the adjacent `data` directory; do not share that directory with other people.

Use Sign In inside the app for YouTube Music, or Settings for Spotify and Discord.
The app has its own account profile and does not read Chrome or Edge profiles.
Password entry is on the provider's HTTPS page. Close the login window after
finishing and return to BitChord. Providers may reject embedded sign-in.

## Included

The upstream v1.9.1 web player's browsing, search, audio/video playback, queue,
shuffle/repeat, crossfade, Automix and its bundled analysis models, artwork,
synced lyrics, account/library/playlist handling, Spotify playlist matching,
Discord presence and Listen Together client. The companion extension's services
are integrated into the desktop main process.

## Limits

- Android USB/AAudio bit-perfect output, system equalizer, offline downloads,
  local-library scanning, Android addons, Wear OS, TV and Cast are not ported.
- Android-only player themes and content settings are not in the upstream web
  player. Browser audio uses the Windows shared mixer.
- Listen Together needs a party server address in Settings. The upstream
  production endpoint is not supplied in the repository; no private credentials
  or invented endpoint are included.
- Real Google, Spotify and Discord account sign-in has not been tested.
- Windows Device Guard blocked launching Electron in the build environment.
  Native launch, live streaming and physical audio output are **not verified**.
  The build is experimental. Do not disable organizational security policies.

## Build on Windows

Prerequisites: Node.js 22+ and pnpm 11.25+ (upstream's lock uses multiple YAML
documents). From the repository root:

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web/app exec tsc -p .
pnpm --dir web/app exec vite build --mode desktop
pnpm --dir web/desktop build
pnpm --dir web/app test
pnpm --dir web/desktop test
pnpm --dir web/desktop package
```

The installer is written to `web/desktop/release`. `package:dir` creates an app
directory. Add `portable.txt` beside the EXE and zip the entire directory to make
the portable edition. Never redistribute a used profile. Executables are not
signed as BitChord unless you configure your own code-signing identity.

Alternatively, `pnpm --dir web/desktop package:portable` assembles the runtime and
app as a portable directory using JavaScript file operations only. It requires
the Electron package's downloaded `dist` directory and does not execute Electron
or Windows installer tools. The optional first and second arguments are the
runtime directory and a new output directory.

Validation in this build: TypeScript checks passed for app, Vite configuration
and shared code; all 159 upstream app tests and all 10 desktop policy/integration
tests passed. The production renderer and bundled main process compiled. The
desktop integration tests use a mocked Electron host; they are not a native
application launch test. Browser visual testing also could not complete because
the test environment could not initialize a browser profile.

## Implementation

- Packaged local UI served from `bitchord://app`.
- Sandboxed renderer with context isolation and Node integration disabled.
- Validated IPC reuses upstream integration handlers. No general shell, file
  access or unrestricted fetch API is exposed to renderer content.
- Player-only YouTube header rules and a separate account session. Provider login
  windows have no app preload or Node access.
- Integration preferences and Discord credentials use Windows DPAPI through
  Electron safeStorage; cookies use Chromium's cookie store.
- Upstream's YouTube player/BotGuard evaluation stays inside the renderer.

BitChord is GPLv3; see LICENSE and resources/LICENSE-BitChord.txt. Electron and
dependencies retain their own licenses. Distribute the corresponding source and
these build instructions with this build.
Original project: https://github.com/kushagrasinghx/BitChord

# Windows Offline Installer

This project supports building a self-contained Windows `.exe` installer for offline environments.

The installer payload is runtime-only. It intentionally excludes repository-only development files such as:

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`
- source trees like `packages/*/src`
- test trees like `packages/*/test`
- type declarations and sourcemaps from deployed package payloads where they are not needed at runtime

## What the installer includes

- Prebuilt `packages/api`, `packages/mcp-server`, and `packages/web`
- Production runtime dependencies installed from staged package manifests whose versions are pinned from the current workspace install
- A bundled Windows Node runtime under `tools/node`
- A bundled portable Redis runtime under `.office-claw/redis/windows/current`
- A bundled `WebView2` desktop launcher (`OfficeClaw.exe`)
- Project runtime files, scripts, and `office-claw-skills`

The installed app does not need to run `pnpm install`, download Node, or fetch Redis again.

## How runtime dependency consistency works

Development and CI use `pnpm install --frozen-lockfile`, so the workspace resolves concrete dependency versions from `pnpm-lock.yaml`.

The Windows bundle builder stages runtime `package.json` files for `packages/api`, `packages/mcp-server`, and `packages/web`, then rewrites their runtime dependencies to the concrete versions already installed in the workspace `node_modules`. After that it runs production-only `npm install` inside the staged package directories.

That means the bundle does not re-resolve broad semver ranges such as `@modelcontextprotocol/sdk: ^1.0.0` against the public registry during packaging. Instead, it installs the same concrete versions currently present in the checked-out workspace, which keeps packaged runtime behavior aligned with development and CI.

## Build the offline bundle

```bash
pnpm package:windows:bundle
```

Output:

- Bundle root: `dist/windows/bundle`

This step builds the package-local runtime layout but does not create an `.exe`.

## Build the `.exe` installer

Requirements on the build machine:

- `makensis` available on `PATH`
- Network access for the build step, unless you override the Node/Redis download URLs with local mirrors

Command:

```bash
pnpm package:windows
```

Output:

- Installer: `dist/windows/OfficeClaw-<version>-windows-x64-setup.exe`

## Optional overrides

You can point the builder at internal mirrors or pinned archives:

```bash
CLOWDER_WINDOWS_NODE_VERSION=v22.20.0 \
CLOWDER_WINDOWS_NODE_ZIP_URL=https://mirror.example/node-v22.20.0-win-x64.zip \
CLOWDER_WINDOWS_REDIS_ZIP_URL=https://mirror.example/Redis-8.2.1-Windows-x64-msys2.zip \
pnpm package:windows
```

## Install, upgrade, uninstall

- Default install path: `C:\CAI`
- Upgrade: rerun a newer installer and install into the same directory
- Start: desktop shortcut or Start Menu shortcut
- Stop: `scripts\stop-windows.ps1`

The installer intentionally defaults to a short path because the bundled production dependency tree can still include long nested paths. If you change the destination, keep it short; the installer blocks paths that would exceed Windows path limits for this build.

The desktop shortcut opens `OfficeClaw.exe`, which:

- starts local services with `scripts/start-windows.ps1 -Quick`
- waits for the frontend to become ready
- opens the app in a dedicated `WebView2` window
- stops managed services again when the desktop window exits

The installer and uninstaller preserve mutable runtime state:

- `.env`
- `cat-config.json`
- `data/`
- `logs/`
- `.office-claw/`

This means upgrades do not wipe local Redis/SQLite state, and uninstall removes the binaries while leaving user data behind.

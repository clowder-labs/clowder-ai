# macOS Runtime Staging Notes

## Purpose

This note records what the current macOS packaging pipeline stages into `Clowder AI.app`, which libraries are installed during staging, and which downloads are intentionally skipped in the first desktop packaging pass.

It exists to make the packaging side effects explicit, especially because the staged runtime install pulls many packages that are normally encountered during development.

## Current Packaging Entry Point

- script: `macos/scripts/build-app.mjs`
- package command: `pnpm package:macos:app`

## What The Script Does Today

The current macOS packaging flow performs these steps:

1. build production artifacts for `shared`, `mcp-server`, `api`, and `web` unless `--skip-build` is used
2. stage runtime-pruned package trees into the app bundle under `Contents/Resources/runtime/packages`
3. run `npm install --omit=dev` inside staged runtime packages for `api`, `mcp-server`, and `web`
4. materialize the staged `@cat-cafe/shared` package into dependent package `node_modules`
5. copy the current macOS Node runtime into `Contents/Resources/runtime/node`

## Why Many Libraries Are Installed

The macOS bundle is not reusing the source checkout `node_modules`. Instead, it creates a fresh runtime install inside the app bundle.

That means packaging will install all runtime dependencies declared by the staged package manifests, including:

- direct app runtime dependencies such as `fastify`, `socket.io`, `next`, `react`, `zod`
- native modules such as `better-sqlite3`, `node-pty`, `sharp`, `sqlite-vec`
- transitive dependencies required by those packages

So even though the packaging command is not intended as a developer setup command, it still downloads and installs a large runtime dependency graph. This is expected for the current design.

## Staged Runtime Packages

### `packages/api`

The staged API runtime currently keeps runtime `dist` output and a runtime `package.json` derived from `packages/api/package.json`.

Notable runtime dependencies include:

- `@fastify/cors`
- `@fastify/multipart`
- `@fastify/static`
- `@fastify/websocket`
- `better-sqlite3`
- `ioredis`
- `node-pty`
- `puppeteer`
- `sharp`
- `sqlite-vec`
- `socket.io`

### `packages/web`

The staged web runtime prefers Next standalone output and installs a minimal runtime dependency set:

- `next`
- `react`
- `react-dom`
- `sharp`

### `packages/mcp-server`

The staged MCP server runtime keeps `dist` output and installs its runtime dependencies:

- `@modelcontextprotocol/sdk`
- `zod`
- staged `@cat-cafe/shared`

### `packages/shared`

The staged shared package is copied as runtime output and then materialized into dependent `node_modules/@cat-cafe/shared` paths when the package manager creates a symlink.

## Download Behavior

### Intentionally Allowed

Packaging currently allows normal `npm install` downloads for runtime dependencies because the bundle needs a fresh macOS-native runtime tree.

### Intentionally Suppressed

The packaging flow sets:

```text
PUPPETEER_SKIP_DOWNLOAD=1
```

This suppresses Chromium download during packaging.

Reason:

- Chromium payloads are large
- they slow iteration significantly
- they are not required to validate the first desktop runtime path
- they can be handled in a later packaging hardening phase

Impact:

- screenshot/export features that rely on Puppeteer-managed browser binaries may not be fully functional in the current packaged app
- the API runtime still installs the `puppeteer` package itself; only the browser download is skipped

## Current Gaps

The current staging logic is correct for a first bundleable runtime, but it still has open packaging questions:

- whether to trim API runtime dependencies further for desktop packaging
- whether to vendor or pre-stage a browser binary for Puppeteer
- whether to make optional features install lazily on first run
- whether to prebuild or cache native module artifacts for repeatable CI packaging

## Current First-Pass Policy

For now, the macOS packaging policy is:

- include enough runtime dependencies for the main app path to boot
- accept that packaging installs a broad runtime dependency set
- skip Puppeteer browser download to keep iteration practical
- document the staged install behavior instead of hiding it

## Next Review Point

Once the bundled startup path is stable, revisit this document to decide:

- which runtime dependencies are truly required for MVP desktop packaging
- which features should be deferred or optionalized
- whether to split the packaging pipeline into core runtime and optional capability packs

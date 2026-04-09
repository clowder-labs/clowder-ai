/**
 * Agent Sidecar Paths — resolve paths for the relay-claw agent sidecar.
 *
 * Core defines the resolution logic; Edition provides vendor-specific
 * path constants via registerEditionSidecarPaths().
 * Community edition: no vendored sidecar → bundleAvailable() returns false.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveCatCafeHostRoot } from './cat-cafe-root.js';

// ── Edition-injectable sidecar path config ──

export interface SidecarPathConfig {
  /** Vendor subdirectory under vendor/ (e.g. 'my-agent') */
  vendorSubdir: string;
  /** Vendor executable name under vendor/ (e.g. 'my-agent.exe') */
  vendorExeName: string;
  /** Python module for -m launch (e.g. 'my_agent.app') */
  pythonModule: string;
  /** Home subdirectory for agent data (e.g. '.my-agent') */
  homeSubdir: string;
  /** Legacy fallback app directory */
  legacyAppDir: string;
  /** Env var prefix for sidecar process (e.g. 'MY_AGENT' → MY_AGENT_ROOT, MY_AGENT_PROJECT_DIR) */
  envPrefix: string;
  /** Log patterns that indicate the sidecar is ready (checked via string.includes()) */
  readyPatterns?: string[];
}

let sidecarConfig: SidecarPathConfig | null = null;

/** Edition calls this at startup to register vendor-specific sidecar paths. */
export function registerEditionSidecarPaths(config: SidecarPathConfig): void {
  sidecarConfig = config;
}

/** Get the current sidecar path config (null = no vendored sidecar). */
export function getSidecarPathConfig(): SidecarPathConfig | null {
  return sidecarConfig;
}

// ── Path resolution ──

function resolveRepoRoot(): string {
  return resolveCatCafeHostRoot(process.cwd());
}

export function resolveVendoredSidecarAppDir(): string {
  const subdir = sidecarConfig?.vendorSubdir ?? 'sidecar';
  return resolve(resolveRepoRoot(), 'vendor', subdir);
}

export function resolveVendoredSidecarExecutable(): string {
  const exeName = sidecarConfig?.vendorExeName ?? 'sidecar';
  return resolve(resolveRepoRoot(), 'vendor', exeName);
}

export function resolveSidecarAppDir(explicitAppDir?: string): string {
  const configured = explicitAppDir?.trim() || process.env.CAT_CAFE_RELAYCLAW_APP_DIR?.trim();
  if (configured) return configured;

  const vendored = resolveVendoredSidecarAppDir();
  const moduleDir = sidecarConfig?.vendorSubdir ?? 'sidecar';
  if (existsSync(join(vendored, moduleDir, 'app.py'))) return vendored;

  return sidecarConfig?.legacyAppDir ?? '/usr/code/relay-claw';
}

export function resolveSidecarExecutable(explicitExecutable?: string): string {
  const configured = explicitExecutable?.trim() || process.env.CAT_CAFE_RELAYCLAW_EXE?.trim();
  if (configured) return configured;
  return resolveVendoredSidecarExecutable();
}

export function resolveSidecarPythonBin(explicitPython?: string, appDir?: string): string {
  const configured = explicitPython?.trim() || process.env.CAT_CAFE_RELAYCLAW_PYTHON?.trim();
  if (configured) return configured;

  const resolvedAppDir = resolveSidecarAppDir(appDir);
  const localCandidates =
    process.platform === 'win32'
      ? [join(resolvedAppDir, '.venv', 'Scripts', 'python.exe'), join(resolvedAppDir, '.venv', 'bin', 'python')]
      : [join(resolvedAppDir, '.venv', 'bin', 'python'), join(resolvedAppDir, '.venv', 'Scripts', 'python.exe')];
  for (const candidate of localCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Shared Python from Windows installer layout (embeddable + deps in Lib/site-packages)
  const sharedPython = join(resolveRepoRoot(), 'tools', 'python', 'python.exe');
  if (existsSync(sharedPython)) return sharedPython;

  const legacyDir = sidecarConfig?.legacyAppDir ?? '/usr/code/relay-claw';
  const legacyCandidates =
    process.platform === 'win32'
      ? [join(legacyDir, '.venv', 'Scripts', 'python.exe'), join(legacyDir, '.venv', 'bin', 'python')]
      : [join(legacyDir, '.venv', 'bin', 'python'), join(legacyDir, '.venv', 'Scripts', 'python.exe')];
  for (const candidate of legacyCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return localCandidates[0];
}

export function sidecarBundleAvailable(): boolean {
  if (!sidecarConfig) return false;

  const executablePath = resolveSidecarExecutable();
  if (existsSync(executablePath)) return true;

  const appDir = resolveSidecarAppDir();
  const pythonBin = resolveSidecarPythonBin(undefined, appDir);
  const moduleDir = sidecarConfig.vendorSubdir;
  return existsSync(join(appDir, moduleDir, 'app.py')) && existsSync(pythonBin);
}

/** Python module name for -m launch (Edition-provided). */
export function getSidecarPythonModule(): string {
  return sidecarConfig?.pythonModule ?? 'sidecar.app';
}

/** Home subdirectory for agent data (Edition-provided). */
export function getSidecarHomeSubdir(): string {
  return sidecarConfig?.homeSubdir ?? '.cat-cafe-agent';
}

/** Env var prefix for sidecar process (Edition-provided). */
export function getSidecarEnvPrefix(): string {
  return sidecarConfig?.envPrefix ?? 'SIDECAR';
}

/** Log patterns that indicate sidecar readiness. */
export function getSidecarReadyPatterns(): string[] {
  return sidecarConfig?.readyPatterns ?? ['WebChannel 已启动'];
}

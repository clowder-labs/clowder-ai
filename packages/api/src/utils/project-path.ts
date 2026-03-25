/**
 * Project Path Validation
 * 共享的路径安全校验，防止路径遍历和 symlink 逃逸。
 *
 * 默认使用 **denylist** 模式：只拦截已知危险系统目录，其余放行。
 * 设置 PROJECT_ALLOWED_ROOTS 环境变量可切换回 allowlist 模式（向后兼容）。
 *
 * 使用 realpath() 解析 symlink 后再做边界检查。
 * 被 projects.ts, threads.ts, AgentRouter.ts 复用。
 */

import { realpath, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { delimiter, relative, resolve, sep, win32 } from 'node:path';

// ── Denylist (new default) ──────────────────────────────────────────

/**
 * System directories that should never be used as project roots.
 * These are virtual/kernel/boot/system directories — not project locations.
 */
export function getDefaultDenylistForPlatform(platformName = platform()): string[] {
  if (platformName === 'win32') {
    const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows';
    return [systemRoot];
  }

  // POSIX: kernel/device/boot directories
  const deny = ['/proc', '/sys', '/dev', '/boot', '/sbin', '/run'];

  if (platformName === 'darwin') {
    deny.push('/System');
  }

  return deny;
}

function DENIED_ROOTS(platformName = platform()): string[] {
  const defaults = getDefaultDenylistForPlatform(platformName);
  const envDeny = process.env.PROJECT_DENIED_ROOTS;
  if (envDeny?.trim()) {
    const custom = envDeny.split(delimiter).filter(Boolean);
    return [...new Set([...defaults, ...custom])];
  }
  return defaults;
}

/**
 * Check if a path falls under any denied root (separator-boundary aware).
 * Also rejects the filesystem root itself (`/` or `C:\`).
 */
export function isPathDenied(absPath: string, denylist: string[], platformName = process.platform): boolean {
  // Reject filesystem root — never a valid project directory
  if (absPath === '/' || /^[A-Z]:\\?$/i.test(absPath)) return true;

  const isWindows = platformName === 'win32';
  for (const denied of denylist) {
    const rel = isWindows ? win32.relative(denied, absPath) : relative(denied, absPath);
    // Exact match (path IS the denied dir)
    if (rel === '') return true;
    // Path is under the denied dir (no leading .. or absolute component)
    if (isWindows && win32.isAbsolute(rel)) continue;
    if (!rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\')) return true;
  }
  return false;
}

// ── Allowlist (legacy / env-var override) ───────────────────────────

/**
 * Legacy allowlist defaults — kept for PROJECT_ALLOWED_ROOTS backward compat.
 */
export function getDefaultRootsForPlatform(
  platformName = platform(),
  opts?: { homeDir?: string; pathExists?: (targetPath: string) => boolean },
): string[] {
  const homeDir = opts?.homeDir ?? homedir();
  const roots = new Set<string>([homeDir]);

  if (platformName === 'win32') {
    return [...roots];
  }

  roots.add('/tmp');
  roots.add('/private/tmp');
  roots.add('/workspace');
  if (platformName === 'darwin') roots.add('/Volumes');
  return [...roots];
}

const defaultRootsCache = new Map<string, string[]>();

const DEFAULT_ROOTS = (): string[] => {
  const platformName = platform();
  const cached = defaultRootsCache.get(platformName);
  if (cached) return cached;
  const roots = getDefaultRootsForPlatform(platformName);
  defaultRootsCache.set(platformName, roots);
  return roots;
};

const ALLOWED_ROOTS = (): string[] | null => {
  const envRoots = process.env.PROJECT_ALLOWED_ROOTS;
  if (envRoots?.trim()) {
    const custom = envRoots.split(delimiter).filter(Boolean);
    const append = process.env.PROJECT_ALLOWED_ROOTS_APPEND === 'true';
    return append ? [...new Set([...DEFAULT_ROOTS(), ...custom])] : custom;
  }
  // No env var → null signals "use denylist mode"
  return null;
};

// ── Unified API ─────────────────────────────────────────────────────

export function isPathUnderRoots(absPath: string, allowedRoots: string[], platformName = process.platform): boolean {
  const isWindows = platformName === 'win32';
  for (const root of allowedRoots) {
    const rel = isWindows ? win32.relative(root, absPath) : relative(root, absPath);
    if (rel === '') {
      return true;
    }
    if (isWindows && win32.isAbsolute(rel)) {
      continue;
    }
    if (!rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\')) {
      return true;
    }
  }
  return false;
}

/** Returns whether the current mode is denylist (true) or allowlist (false). */
export function isDenylistMode(): boolean {
  return ALLOWED_ROOTS() === null;
}

/**
 * Expose the computed allowlist/denylist for structured error responses.
 * In denylist mode, returns the denylist prefixed with "!" for clarity.
 */
export function getAllowedRoots(): string[] {
  const allowlist = ALLOWED_ROOTS();
  if (allowlist) return allowlist;
  // Denylist mode — return denied dirs prefixed with "!" for error context
  return DENIED_ROOTS().map((d) => `!${d}`);
}

/**
 * Check if a path string (without fs access) is plausibly allowed.
 *
 * - If PROJECT_ALLOWED_ROOTS is set → allowlist mode (legacy).
 * - Otherwise → denylist mode: allowed unless under a denied system dir.
 *
 * For full validation (including symlinks), use validateProjectPath().
 */
export function isUnderAllowedRoot(absPath: string): boolean {
  const allowlist = ALLOWED_ROOTS();
  if (allowlist) {
    return isPathUnderRoots(absPath, allowlist);
  }
  // Denylist mode: allowed unless denied
  return !isPathDenied(absPath, DENIED_ROOTS());
}

/**
 * Check if a path is an allowed project directory.
 *
 * 1. Resolves the path to absolute
 * 2. Uses realpath() to follow symlinks and canonicalize
 * 3. Checks the real path against deny/allow rules
 * 4. Verifies the path is an existing directory
 *
 * @returns The canonicalized real path if valid, or null if rejected.
 */
export async function validateProjectPath(rawPath: string): Promise<string | null> {
  try {
    const absPath = resolve(rawPath);
    // realpath resolves symlinks → canonical path
    const realPath = await realpath(absPath);

    if (!isUnderAllowedRoot(realPath)) return null;

    const info = await stat(realPath);
    if (!info.isDirectory()) return null;

    return realPath;
  } catch {
    // ENOENT, EACCES, etc.
    return null;
  }
}

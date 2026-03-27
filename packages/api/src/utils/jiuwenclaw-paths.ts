import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveCatCafeHostRoot } from './cat-cafe-root.js';

const LEGACY_JIUWENCLAW_APP_DIR = '/usr/code/relay-claw';

function resolveRepoRoot(): string {
  return resolveCatCafeHostRoot(process.cwd());
}

export function resolveVendoredJiuwenClawAppDir(): string {
  return resolve(resolveRepoRoot(), 'vendor/jiuwenclaw');
}

export function resolveVendoredJiuwenClawExecutable(): string {
  return resolve(resolveRepoRoot(), 'vendor/jiuwenclaw.exe');
}

export function resolveJiuwenClawAppDir(explicitAppDir?: string): string {
  const configured = explicitAppDir?.trim() || process.env.CAT_CAFE_RELAYCLAW_APP_DIR?.trim();
  if (configured) return configured;

  const vendored = resolveVendoredJiuwenClawAppDir();
  if (existsSync(join(vendored, 'jiuwenclaw', 'app.py'))) return vendored;

  return LEGACY_JIUWENCLAW_APP_DIR;
}

export function resolveJiuwenClawExecutable(explicitExecutable?: string): string {
  const configured = explicitExecutable?.trim() || process.env.CAT_CAFE_RELAYCLAW_EXE?.trim();
  if (configured) return configured;
  return resolveVendoredJiuwenClawExecutable();
}

export function resolveJiuwenClawPythonBin(explicitPython?: string, appDir?: string): string {
  const configured = explicitPython?.trim() || process.env.CAT_CAFE_RELAYCLAW_PYTHON?.trim();
  if (configured) return configured;

  const resolvedAppDir = resolveJiuwenClawAppDir(appDir);
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

  const legacyCandidates =
    process.platform === 'win32'
      ? [
          join(LEGACY_JIUWENCLAW_APP_DIR, '.venv', 'Scripts', 'python.exe'),
          join(LEGACY_JIUWENCLAW_APP_DIR, '.venv', 'bin', 'python'),
        ]
      : [
          join(LEGACY_JIUWENCLAW_APP_DIR, '.venv', 'bin', 'python'),
          join(LEGACY_JIUWENCLAW_APP_DIR, '.venv', 'Scripts', 'python.exe'),
        ];
  for (const candidate of legacyCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return localCandidates[0];
}

export function jiuwenClawBundleAvailable(): boolean {
  const executablePath = resolveJiuwenClawExecutable();
  if (existsSync(executablePath)) return true;

  const appDir = resolveJiuwenClawAppDir();
  const pythonBin = resolveJiuwenClawPythonBin(undefined, appDir);
  return existsSync(join(appDir, 'jiuwenclaw', 'app.py')) && existsSync(pythonBin);
}

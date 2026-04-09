/**
 * Version Route
 * GET /api/curversion — current version info
 * GET /api/lastversion — latest version info (Edition-provided or echo)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';

// ── Edition version checker hook ──

export interface EditionVersionInfo {
  lastversion: string;
  downloadUrl?: string;
  description?: string;
}

type EditionVersionChecker = (request: FastifyRequest) => Promise<EditionVersionInfo>;

let editionVersionChecker: EditionVersionChecker | null = null;

/** Edition calls this at startup to register a vendor-specific version checker. */
export function registerEditionVersionChecker(checker: EditionVersionChecker): void {
  editionVersionChecker = checker;
}

// ── Routes ──

interface VersionRoutesOptions {
  projectRoot?: string;
}

function getPackageVersion(projectRoot: string): string {
  const pkgPath = resolve(projectRoot, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function versionRoutes(app: FastifyInstance, opts: VersionRoutesOptions = {}): Promise<void> {
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();

  app.get('/api/curversion', async () => {
    const version = getPackageVersion(projectRoot);
    return {
      version,
      name: '@cat-cafe/api',
      current: true,
    };
  });

  app.get('/api/lastversion', async (request) => {
    const curversion = getPackageVersion(projectRoot);
    if (editionVersionChecker) {
      try {
        const info = await editionVersionChecker(request);
        return { curversion, ...info };
      } catch {
        return { curversion, lastversion: curversion };
      }
    }
    return { curversion, lastversion: curversion };
  });
}

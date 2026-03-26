/**
 * Version Route
 * GET /api/curversion — 返回当前版本信息
 * GET /api/lastversion — 返回最新版本信息
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';

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

  app.get('/api/lastversion', async () => {
    try {
      const response = await fetch('https://registry.npmjs.org/@cat-cafe/api/latest', {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        return {
          version: getPackageVersion(projectRoot),
          name: '@cat-cafe/api',
          latest: true,
          error: 'Failed to fetch latest version',
        };
      }
      const data = (await response.json()) as { version: string };
      return {
        version: data.version,
        name: '@cat-cafe/api',
        latest: true,
      };
    } catch {
      return {
        version: getPackageVersion(projectRoot),
        name: '@cat-cafe/api',
        latest: true,
        error: 'Network error',
      };
    }
  });
}

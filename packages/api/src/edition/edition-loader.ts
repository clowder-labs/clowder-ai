/**
 * Edition Loader — reads edition.json, loads Edition Module, returns config.
 *
 * If no edition.json is found, returns DEFAULT_EDITION (open-source mode).
 * If edition.json exists but register() fails, Core refuses to start (no silent fallback).
 *
 * @see binary-core-product-line-v3.md §4.5, §6
 * [宪宪/Opus-46🐾] Phase 1 — Edition Bootstrap
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { EditionConfig, IEditionModule } from './types.js';
import { EditionRegistryImpl } from './types.js';

// ─── Core API version (bumped per release) ────────────

export const CORE_API_VERSION = '0.1.0';

// ─── Default Edition (open-source, no plugins) ───────

export const DEFAULT_EDITION: EditionConfig = {
  coreApiVersion: `^${CORE_API_VERSION}`,
  edition: 'community',
  version: '0.0.0',
  branding: {
    appName: 'Clowder AI',
    themeColor: '#6366f1',
    locale: 'en',
  },
  identity: { mode: 'no-auth' },
  features: {
    remoteSkillHub: false,
    voiceIO: false,
    agentTeams: false,
    werewolfGame: false,
  },
};

// ─── edition.json discovery ───────────────────────────

const EDITION_JSON_NAMES = ['edition.json'];

function findEditionJson(projectRoot: string): string | null {
  for (const name of EDITION_JSON_NAMES) {
    const candidate = join(projectRoot, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── Security: path validation ────────────────────────

function validatePluginPath(editionDir: string, pluginPath: string): string {
  if (isAbsolute(pluginPath)) {
    throw new Error(`Absolute plugin paths are forbidden: ${pluginPath}`);
  }

  const realEditionDir = realpathSync(editionDir);
  const resolved = resolve(editionDir, pluginPath);

  // Ensure the file actually exists before realpathSync
  if (!existsSync(resolved)) {
    throw new Error(`Edition module not found: ${resolved}`);
  }

  const realResolved = realpathSync(resolved);
  const rel = relative(realEditionDir, realResolved);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Plugin path escapes edition directory: ${pluginPath}`);
  }

  return realResolved;
}

// ─── Semver compatibility check (simple) ──────────────

function satisfiesCaret(required: string, actual: string): boolean {
  // Parse ^major.minor.patch
  const range = required.replace(/^\^/, '');
  const [reqMajor] = range.split('.').map(Number);
  const [actMajor, actMinor] = actual.split('.').map(Number);
  const [, reqMinor] = range.split('.').map(Number);

  if (reqMajor === 0) {
    // 0.x: caret means ~0.x (minor must match)
    return actMajor === 0 && actMinor === reqMinor;
  }
  // >=1.0: caret means same major
  return actMajor === reqMajor;
}

// ─── Main loader ──────────────────────────────────────

export interface LoadEditionOptions {
  projectRoot: string;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; fatal: (msg: string) => void };
}

export async function loadEdition(options: LoadEditionOptions): Promise<EditionConfig> {
  const { projectRoot, logger } = options;

  const editionJsonPath = findEditionJson(projectRoot);

  if (!editionJsonPath) {
    logger.info('No edition.json found — using DEFAULT_EDITION (community/open-source mode)');
    return { ...DEFAULT_EDITION };
  }

  // Parse edition.json
  const raw = JSON.parse(readFileSync(editionJsonPath, 'utf-8'));
  const editionDir = dirname(editionJsonPath);

  // Validate Core API version compatibility
  const requiredVersion = raw.coreApiVersion;
  if (requiredVersion && !satisfiesCaret(requiredVersion, CORE_API_VERSION)) {
    throw new Error(
      `Edition requires Core API ${requiredVersion}, but current Core is ${CORE_API_VERSION}. ` +
        'Upgrade Core or downgrade Edition.',
    );
  }

  // Build config
  const config: EditionConfig = {
    coreApiVersion: requiredVersion ?? `^${CORE_API_VERSION}`,
    edition: raw.edition ?? 'unknown',
    version: raw.version ?? '0.0.0',
    branding: {
      appName: raw.branding?.appName ?? 'Clowder AI',
      windowTitle: raw.branding?.windowTitle,
      logoSrc: raw.branding?.logoSrc,
      themeColor: raw.branding?.themeColor ?? '#6366f1',
      locale: raw.branding?.locale ?? 'en',
      assetsDir: raw.branding?.assetsDir,
    },
    identity: {
      mode: raw.identity?.mode ?? 'no-auth',
    },
    features: raw.features ?? {},
  };

  // Load Edition Module if specified
  if (raw.editionMain) {
    const mainPath = validatePluginPath(editionDir, raw.editionMain);
    logger.info(`Loading Edition Module: ${config.edition} v${config.version} from ${mainPath}`);

    const editionModule = (await import(mainPath)) as IEditionModule;
    const registry = new EditionRegistryImpl();

    // register() failure = refuse to start (no silent fallback)
    try {
      await editionModule.register(registry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.fatal(`Edition "${config.edition}" register() failed: ${msg}`);
      process.exit(1);
    }

    registry.freeze();
    config._registry = registry;

    logger.info(
      `Edition loaded: ${registry.modelSources.length} model sources, ` +
        `${registry.skillSources.length} skill sources, ` +
        `${registry.connectors.length} connectors`,
    );
  }

  return config;
}

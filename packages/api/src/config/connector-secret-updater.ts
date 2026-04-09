/**
 * Simplified connector secret updater — writes env vars to .env file
 * and syncs to process.env. Unlike Cat Cafe upstream, this version does
 * NOT emit configEventBus events (Clowder has no event bus wiring yet).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';

export interface ConnectorSecretUpdate {
  name: string;
  value: string | null;
}

export interface ConnectorSecretUpdaterOptions {
  envFilePath?: string;
}

function formatEnvFileValue(value: string): string {
  const escapedControlChars = value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  if (/^[A-Za-z0-9_./:@-]+$/.test(escapedControlChars)) return escapedControlChars;
  return `"${escapedControlChars
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')}"`;
}

function applyEnvUpdatesToFile(contents: string, updates: Map<string, string | null>): string {
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  const seen = new Set<string>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextLines.push(line);
      continue;
    }
    const name = match[1]!;
    if (!updates.has(name)) {
      nextLines.push(line);
      continue;
    }
    seen.add(name);
    const value = updates.get(name);
    if (value == null || value === '') continue;
    nextLines.push(`${name}=${formatEnvFileValue(value)}`);
  }

  for (const [name, value] of updates) {
    if (seen.has(name) || value == null || value === '') continue;
    nextLines.push(`${name}=${formatEnvFileValue(value)}`);
  }

  const normalized = nextLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return normalized.length > 0 ? `${normalized}\n` : '';
}

export async function applyConnectorSecretUpdates(
  updates: ConnectorSecretUpdate[],
  opts: ConnectorSecretUpdaterOptions = {},
): Promise<{ changedKeys: string[] }> {
  const envFilePath = opts.envFilePath ?? resolve(resolveActiveProjectRoot(), '.env');
  const updatesMap = new Map<string, string | null>(updates.map((update) => [update.name, update.value]));

  const oldValues = new Map<string, string | undefined>();
  for (const name of updatesMap.keys()) {
    oldValues.set(name, process.env[name]);
  }

  const current = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : '';
  const next = applyEnvUpdatesToFile(current, updatesMap);
  writeFileSync(envFilePath, next, 'utf8');

  for (const [name, value] of updatesMap) {
    if (value == null || value === '') delete process.env[name];
    else process.env[name] = value;
  }

  const changedKeys = [...updatesMap.entries()]
    .filter(([name, value]) => (value ?? '') !== (oldValues.get(name) ?? ''))
    .map(([name]) => name);

  return { changedKeys };
}

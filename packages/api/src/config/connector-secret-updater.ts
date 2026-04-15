/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Simplified connector secret updater.
 *
 * Non-sensitive connector config is written to `.env`.
 * On Windows, sensitive connector secrets are stored in the local secret store
 * and `.env` only keeps a `*_REF` pointer.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConnectorRuntimeApplySummary, ConnectorRuntimeReconciler } from '../infrastructure/connectors/ConnectorRuntimeManager.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import {
  buildConnectorEnvRefVarName,
  clearConnectorEnvSecret,
  getConnectorEnvValue,
  isConnectorSecretBackedEnvVarName,
  isLocalSecretStorageEnabled,
  persistConnectorEnvSecret,
} from './local-secret-store.js';

export interface ConnectorSecretUpdate {
  name: string;
  value: string | null;
}

export interface ConnectorSecretUpdaterOptions {
  envFilePath?: string;
  reconciler?: ConnectorRuntimeReconciler;
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
): Promise<{ changedKeys: string[]; runtime?: ConnectorRuntimeApplySummary }> {
  const envFilePath = opts.envFilePath ?? resolve(resolveActiveProjectRoot(), '.env');
  const updatesMap = new Map<string, string | null>(updates.map((update) => [update.name, update.value]));
  const fileUpdates = new Map<string, string | null>();
  const nextValues = new Map<string, string>();

  const oldValues = new Map<string, string | undefined>();
  for (const name of updatesMap.keys()) {
    oldValues.set(name, getConnectorEnvValue(name) ?? process.env[name]);
  }

  const secretBacked = isLocalSecretStorageEnabled();
  for (const [name, value] of updatesMap) {
    const normalizedValue = value == null ? null : value.trim();
    const refName = buildConnectorEnvRefVarName(name);
    if (isConnectorSecretBackedEnvVarName(name) && secretBacked) {
      const trimmed = normalizedValue ?? '';
      if (!trimmed) {
        clearConnectorEnvSecret(name);
        delete process.env[name];
        delete process.env[refName];
        fileUpdates.set(name, null);
        fileUpdates.set(refName, null);
        nextValues.set(name, '');
      } else {
        const persisted = persistConnectorEnvSecret(name, trimmed);
        process.env[name] = trimmed;
        process.env[persisted.refName] = persisted.refValue;
        fileUpdates.set(name, null);
        fileUpdates.set(persisted.refName, persisted.refValue);
        nextValues.set(name, trimmed);
      }
      continue;
    }

    if (isConnectorSecretBackedEnvVarName(name)) {
      clearConnectorEnvSecret(name);
      delete process.env[refName];
      fileUpdates.set(refName, null);
    }

    if (normalizedValue == null || normalizedValue === '') {
      delete process.env[name];
      fileUpdates.set(name, null);
      nextValues.set(name, '');
    } else {
      process.env[name] = normalizedValue;
      fileUpdates.set(name, normalizedValue);
      nextValues.set(name, normalizedValue);
    }
  }

  const current = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : '';
  const next = applyEnvUpdatesToFile(current, fileUpdates);
  writeFileSync(envFilePath, next, 'utf8');

  const changedKeys = [...updatesMap.keys()].filter((name) => (nextValues.get(name) ?? '') !== (oldValues.get(name) ?? ''));

  const runtime = opts.reconciler && changedKeys.length > 0 ? await opts.reconciler.reconcile(changedKeys) : undefined;
  return runtime ? { changedKeys, runtime } : { changedKeys };
}

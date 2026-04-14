/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Config Route
 * GET   /api/config              — 返回运行时配置快照
 * PATCH /api/config              — 热更新可变配置 (F4)
 * GET   /api/config/env-summary  — 返回用户可配的 env 变量及当前值 (F12)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ConnectorRuntimeReconciler } from '../infrastructure/connectors/ConnectorRuntimeManager.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { collectConfigSnapshot } from '../config/ConfigRegistry.js';
import { configStore } from '../config/ConfigStore.js';
import type { ConfigSnapshot } from '../config/config-snapshot.js';
import type { AgentRegistry } from '../domains/cats/services/agents/registry/AgentRegistry.js';
import {
  buildEnvSummary,
  ENV_CATEGORIES,
  ENV_VARS,
  isConnectorEnvVarName,
  isConnectorSensitiveEditable,
  isEditableEnvVarName,
} from '../config/env-registry.js';
import {
  buildConnectorEnvRefVarName,
  clearConnectorEnvSecret,
  isConnectorSecretBackedEnvVarName,
  isLocalSecretStorageEnabled,
  persistConnectorEnvSecret,
} from '../config/local-secret-store.js';
import { updateRuntimeCoCreator } from '../config/runtime-cat-catalog.js';
import { AuditEventTypes, getEventAuditLog } from '../domains/cats/services/orchestration/EventAuditLog.js';
import {
  createRelayClawSecurityClient,
  type RelayClawSecurityClient,
  type RelayClawSecurityPermissionsConfig,
} from './relayclaw-security-proxy.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const envPatchSchema = z.object({
  updates: z.array(z.object({ name: z.string().min(1), value: z.string().nullable() })).min(1),
});

const relayClawSecurityPatchSchema = z.object({
  permissions: z
    .object({
      enabled: z.boolean().optional(),
      tools: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'permissions patch must not be empty'),
});

const coCreatorPatchSchema = z.object({
  name: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  mentionPatterns: z.array(z.string().trim().min(1)).min(1),
  avatar: z.string().trim().nullable().optional(),
  color: z
    .object({
      primary: z.string().min(1),
      secondary: z.string().min(1),
    })
    .nullable()
    .optional(),
});

const runtimeStatusQuerySchema = z.object({
  category: z.string().optional(),
});

interface ConfigRoutesOptions {
  auditLog?: {
    append(input: { type: string; threadId?: string; data: Record<string, unknown> }): Promise<unknown>;
  };
  envFilePath?: string;
  projectRoot?: string;
  connectorRuntimeManager?: ConnectorRuntimeReconciler;
  relayClawSecurityClient?: RelayClawSecurityClient;
  agentRegistry?: AgentRegistry;
}

function getSnapshotValue(snapshot: ConfigSnapshot, key: string): unknown {
  const path = configStore.getSnapshotPath(key);
  if (!path) return undefined;
  return path.reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, snapshot);
}

function resolveOperator(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof first === 'string') return first.trim();
  }
  return null;
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

export async function configRoutes(app: FastifyInstance, opts: ConfigRoutesOptions = {}): Promise<void> {
  const auditLog = opts.auditLog ?? getEventAuditLog();
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();
  const envFilePath = opts.envFilePath ?? resolve(projectRoot, '.env');
  const relayClawSecurityClient = opts.relayClawSecurityClient ?? createRelayClawSecurityClient(projectRoot, opts.agentRegistry);

  app.get('/api/config', async () => ({
    config: collectConfigSnapshot(),
  }));

  app.patch('/api/config', async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const before = collectConfigSnapshot();
    const oldValue = getSnapshotValue(before, parsed.data.key);
    try {
      configStore.set(parsed.data.key, parsed.data.value);
    } catch (err) {
      reply.status(400);
      return { error: (err as Error).message };
    }
    const after = collectConfigSnapshot();
    const newValue = getSnapshotValue(after, parsed.data.key);
    const riskLevel = configStore.getRiskLevel(parsed.data.key) ?? 'standard';

    if (riskLevel === 'high') {
      request.log.warn(
        {
          key: parsed.data.key,
          operator,
        },
        'high-risk config key updated',
      );
    }

    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          key: parsed.data.key,
          oldValue,
          newValue,
          operator,
          riskLevel,
          source: configStore.source(parsed.data.key) ?? 'default',
        },
      });
    } catch (err) {
      request.log.warn({ err, key: parsed.data.key }, 'config audit append failed');
    }

    return { config: after };
  });

  const handleCoCreatorPatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = coCreatorPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    try {
      updateRuntimeCoCreator(projectRoot, {
        name: parsed.data.name,
        aliases: parsed.data.aliases,
        mentionPatterns: parsed.data.mentionPatterns,
        ...(parsed.data.avatar !== undefined ? { avatar: parsed.data.avatar } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      });
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }

    const next = collectConfigSnapshot();
    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          target: 'coCreator',
          operator,
          name: next.coCreator.name,
          mentionPatterns: next.coCreator.mentionPatterns,
        },
      });
    } catch (err) {
      request.log.warn({ err }, 'coCreator config audit append failed');
    }

    return { config: next };
  };

  app.patch('/api/config/co-creator', handleCoCreatorPatch);

  // Backward-compat: old path delegates to same handler (deprecated)
  app.patch('/api/config/owner', async (request, reply) => {
    request.log.warn('DEPRECATED: /api/config/owner — use /api/config/co-creator');
    return handleCoCreatorPatch(request, reply);
  });

  app.get('/api/config/relayclaw/security', async (request, reply) => {
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    try {
      const permissions = await relayClawSecurityClient.getPermissions();
      return { permissions };
    } catch (err) {
      reply.status(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.patch('/api/config/relayclaw/security', async (request, reply) => {
    const parsed = relayClawSecurityPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    try {
      const permissions = await relayClawSecurityClient.setPermissions(
        parsed.data.permissions as RelayClawSecurityPermissionsConfig,
      );
      return { permissions };
    } catch (err) {
      reply.status(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get('/api/config/env-summary', async () => {
    const monoRoot = findMonorepoRoot();
    const home = os.homedir();
    return {
      categories: ENV_CATEGORIES,
      variables: buildEnvSummary(),
      paths: {
        projectRoot,
        homeDir: home,
        dataDirs: {
          auditLogs: resolve(monoRoot, process.env.AUDIT_LOG_DIR ?? 'data/audit-logs'),
          runtimeLogs: resolve(monoRoot, 'data/logs/api'),
          cliArchive: resolve(monoRoot, process.env.CLI_RAW_ARCHIVE_DIR ?? 'data/cli-raw-archive'),
          redisDevSandbox: resolve(home, '.office-claw/redis-dev-sandbox'),
          uploads: resolve(monoRoot, process.env.UPLOAD_DIR ?? 'data/uploads'),
        },
      },
    };
  });

  app.patch('/api/config/env', async (request, reply) => {
    const parsed = envPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const updates = new Map<string, string | null>();
    const fileUpdates = new Map<string, string | null>();
    const secretBacked = isLocalSecretStorageEnabled();
    for (const update of parsed.data.updates) {
      if (!isEditableEnvVarName(update.name)) {
        reply.status(400);
        return { error: `Env var '${update.name}' is not editable from Hub` };
      }
      updates.set(update.name, update.value);
    }

    const current = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : '';
    for (const [name, value] of updates) {
      const definition = ENV_VARS.find((item) => item.name === name);
      const isConnectorSecret = Boolean(definition && isConnectorSensitiveEditable(definition));
      const refName = buildConnectorEnvRefVarName(name);

      if (isConnectorSecret && isConnectorSecretBackedEnvVarName(name) && secretBacked) {
        const trimmed = value?.trim() ?? '';
        if (!trimmed) {
          clearConnectorEnvSecret(name);
          delete process.env[name];
          delete process.env[refName];
          fileUpdates.set(name, null);
          fileUpdates.set(refName, null);
        } else {
          const persisted = persistConnectorEnvSecret(name, trimmed);
          process.env[name] = trimmed;
          process.env[persisted.refName] = persisted.refValue;
          fileUpdates.set(name, null);
          fileUpdates.set(persisted.refName, persisted.refValue);
        }
        continue;
      }

      if (isConnectorSecret && isConnectorSecretBackedEnvVarName(name)) {
        clearConnectorEnvSecret(name);
        delete process.env[refName];
        fileUpdates.set(refName, null);
      }

      if (value == null || value === '') {
        delete process.env[name];
        fileUpdates.set(name, null);
      } else {
        process.env[name] = value;
        fileUpdates.set(name, value);
      }
    }

    const next = applyEnvUpdatesToFile(current, fileUpdates);
    writeFileSync(envFilePath, next, 'utf8');

    const changedKeys: string[] = [];
    for (const [name] of updates) {
      changedKeys.push(name);
    }

    const runtime = opts.connectorRuntimeManager && changedKeys.length > 0
      ? await opts.connectorRuntimeManager.reconcile(changedKeys)
      : undefined;
    const changedConnectorEnv = changedKeys.some((name) => isConnectorEnvVarName(name));
    const needsRestart = changedConnectorEnv && (!runtime || !runtime.applied);

    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          target: '.env',
          keys: [...updates.keys()],
          operator,
        },
      });
    } catch (err) {
      request.log.warn({ err, keys: [...updates.keys()] }, 'env config audit append failed');
    }

    return { ok: true, requiresRestart: needsRestart, runtime, envFilePath, summary: buildEnvSummary() };
  });
}

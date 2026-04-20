/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { createCatId } from '@office-claw/shared';
import type { RelayClawAgentConfig } from '@office-claw/shared';
import {
  FrameQueue,
  RelayClawConnectionManager,
  type RelayClawConnection,
} from '../domains/cats/services/agents/providers/relayclaw-connection.js';
import {
  DefaultRelayClawSidecarController,
  type RelayClawSidecarController,
} from '../domains/cats/services/agents/providers/relayclaw-sidecar.js';
import type { RelayClawRuntimeHandle } from '../domains/cats/services/agents/providers/RelayClawAgentService.js';
import type { AgentRegistry } from '../domains/cats/services/agents/registry/AgentRegistry.js';
import { resolveJiuwenClawAppDir, resolveJiuwenClawExecutable, resolveJiuwenClawPythonBin } from '../utils/jiuwenclaw-paths.js';

export interface RelayClawSecurityPermissionsConfig {
  enabled?: boolean;
  tools?: Record<string, unknown>;
}

export interface RelayClawSecurityClient {
  getPermissions(): Promise<RelayClawSecurityPermissionsConfig>;
  setPermissions(patch: RelayClawSecurityPermissionsConfig): Promise<RelayClawSecurityPermissionsConfig>;
}

const RELAYCLAW_CAT_ID = 'relayclaw';

interface RelayClawAgentResponseFrame {
  ok?: boolean;
  payload?: {
    trees?: Record<string, unknown>;
    error?: string;
  };
}

interface RelayClawRuntimeProvider {
  listRelayClawRuntimeHandles(): RelayClawRuntimeHandle[];
}

interface RelayClawSecurityTarget {
  scopeKey: string;
  requestQueues: Map<string, FrameQueue>;
  connection: RelayClawConnection;
  sidecar: RelayClawSidecarController;
  resolvedUrl: string;
}

function isRelayClawRuntimeProvider(value: unknown): value is RelayClawRuntimeProvider {
  return Boolean(value && typeof value === 'object' && 'listRelayClawRuntimeHandles' in value);
}

class LegacyRelayClawSecurityClient implements RelayClawSecurityClient {
  private readonly requestQueues = new Map<string, FrameQueue>();
  private readonly connection: RelayClawConnection;
  private readonly sidecar: RelayClawSidecarController;

  constructor() {
    this.connection = new RelayClawConnectionManager({ requestQueues: this.requestQueues });
    this.sidecar = new DefaultRelayClawSidecarController(createCatId(RELAYCLAW_CAT_ID), this.buildConfig());
  }

  async getPermissions(): Promise<RelayClawSecurityPermissionsConfig> {
    const frame = await this.sendRequest('config.get', { config_paths: ['permissions'] });
    const permissions = frame.payload?.trees?.['permissions'];
    if (!permissions || typeof permissions !== 'object') {
      throw new Error(frame.payload?.error || 'Failed to load relayclaw permissions');
    }
    return permissions as RelayClawSecurityPermissionsConfig;
  }

  async setPermissions(patch: RelayClawSecurityPermissionsConfig): Promise<RelayClawSecurityPermissionsConfig> {
    await this.sendRequest('config.set', { config_yaml: { permissions: patch } });
    return this.getPermissions();
  }

  private async ensureConnected(): Promise<void> {
    const url = await this.sidecar.ensureStarted();
    await this.connection.ensureConnected(url);
  }

  private async sendRequest(
    reqMethod: 'config.get' | 'config.set',
    params: Record<string, unknown>,
  ): Promise<RelayClawAgentResponseFrame> {
    await this.ensureConnected();

    const requestId = randomUUID();
    const queue = new FrameQueue();
    this.requestQueues.set(requestId, queue);

    try {
      this.connection.send({
        request_id: requestId,
        channel_id: 'web',
        session_id: null,
        req_method: reqMethod,
        params,
        is_stream: false,
        timestamp: Date.now() / 1000,
      });

      const frame = (await queue.take()) as RelayClawAgentResponseFrame | null;
      if (!frame) {
        throw new Error('relayclaw security proxy did not receive a response');
      }
      if (!frame.ok) {
        throw new Error(frame.payload?.error || `relayclaw ${reqMethod} failed`);
      }
      return frame;
    } finally {
      this.requestQueues.delete(requestId);
    }
  }

  private buildConfig(): RelayClawAgentConfig {
    const appDir = resolveJiuwenClawAppDir();
    const executablePath = resolveJiuwenClawExecutable();
    const pythonBin = resolveJiuwenClawPythonBin(undefined, appDir);

    return {
      executablePath,
      appDir,
      pythonBin,
    };
  }
}

export class DefaultRelayClawSecurityClient implements RelayClawSecurityClient {
  private readonly agentRegistry?: AgentRegistry;
  private readonly fallbackClient: RelayClawSecurityClient;

  constructor(agentRegistry?: AgentRegistry, fallbackClient?: RelayClawSecurityClient) {
    this.agentRegistry = agentRegistry;
    this.fallbackClient = fallbackClient ?? new LegacyRelayClawSecurityClient();
  }

  async getPermissions(): Promise<RelayClawSecurityPermissionsConfig> {
    const liveTargets = this.listLiveTargets();
    if (liveTargets.length === 0) {
      return this.fallbackClient.getPermissions();
    }

    const errors: string[] = [];
    for (const target of liveTargets) {
      try {
        const frame = await this.sendRequestToTarget(target, 'config.get', { config_paths: ['permissions'] });
        return this.extractPermissions(frame);
      } catch (err) {
        errors.push(`${target.scopeKey}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error(`Failed to load relayclaw permissions from live runtimes: ${errors.join('; ')}`);
  }

  async setPermissions(patch: RelayClawSecurityPermissionsConfig): Promise<RelayClawSecurityPermissionsConfig> {
    const liveTargets = this.listLiveTargets();
    if (liveTargets.length === 0) {
      return this.fallbackClient.setPermissions(patch);
    }

    const requestParams = { config_yaml: { permissions: patch } };
    const results = await Promise.allSettled(
      liveTargets.map((target) => this.sendRequestToTarget(target, 'config.set', requestParams)),
    );
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [`${liveTargets[index]?.scopeKey ?? `target-${index}`}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
        : [],
    );
    if (failures.length > 0) {
      throw new Error(`Failed to apply relayclaw permissions to live runtimes: ${failures.join('; ')}`);
    }

    const frame = await this.sendRequestToTarget(liveTargets[0]!, 'config.get', { config_paths: ['permissions'] });
    return this.extractPermissions(frame);
  }

  private listLiveTargets(): RelayClawSecurityTarget[] {
    if (!this.agentRegistry) {
      return [];
    }

    const targets: RelayClawSecurityTarget[] = [];
    for (const [, service] of this.agentRegistry.getAllEntries()) {
      if (!isRelayClawRuntimeProvider(service)) {
        continue;
      }
      for (const runtime of service.listRelayClawRuntimeHandles()) {
        if (!runtime.resolvedUrl) {
          continue;
        }
        targets.push({
          scopeKey: runtime.scopeKey,
          requestQueues: runtime.requestQueues,
          connection: runtime.connection,
          sidecar: runtime.sidecar,
          resolvedUrl: runtime.resolvedUrl,
        });
      }
    }
    return targets;
  }

  private extractPermissions(frame: RelayClawAgentResponseFrame): RelayClawSecurityPermissionsConfig {
    const permissions = frame.payload?.trees?.['permissions'];
    if (!permissions || typeof permissions !== 'object') {
      throw new Error(frame.payload?.error || 'Failed to load relayclaw permissions');
    }
    return permissions as RelayClawSecurityPermissionsConfig;
  }

  private async sendRequestToTarget(
    target: RelayClawSecurityTarget,
    reqMethod: 'config.get' | 'config.set',
    params: Record<string, unknown>,
  ): Promise<RelayClawAgentResponseFrame> {
    // Reuse the live runtime endpoint instead of re-evaluating sidecar startup
    // with empty request options, which can force unnecessary restarts.
    await target.connection.ensureConnected(target.resolvedUrl);

    const requestId = randomUUID();
    const queue = new FrameQueue();
    target.requestQueues.set(requestId, queue);

    try {
      target.connection.send({
        request_id: requestId,
        channel_id: 'web',
        session_id: null,
        req_method: reqMethod,
        params,
        is_stream: false,
        timestamp: Date.now() / 1000,
      });

      const frame = (await queue.take()) as RelayClawAgentResponseFrame | null;
      if (!frame) {
        throw new Error('relayclaw security proxy did not receive a response');
      }
      if (!frame.ok) {
        throw new Error(frame.payload?.error || `relayclaw ${reqMethod} failed`);
      }
      return frame;
    } finally {
      target.requestQueues.delete(requestId);
    }
  }
}

export function createRelayClawSecurityClient(_projectRoot: string, agentRegistry?: AgentRegistry): RelayClawSecurityClient {
  return new DefaultRelayClawSecurityClient(agentRegistry);
}

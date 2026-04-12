/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { catRegistry, createCatId } from '@cat-cafe/shared';
import type { RelayClawAgentConfig } from '@cat-cafe/shared';
import { resolveBoundAccountRefForCat } from '../config/cat-account-binding.js';
import { resolveRuntimeProviderProfileForClient } from '../config/provider-profiles.js';
import {
  FrameQueue,
  RelayClawConnectionManager,
  type RelayClawConnection,
} from '../domains/cats/services/agents/providers/relayclaw-connection.js';
import {
  DefaultRelayClawSidecarController,
  type RelayClawSidecarController,
} from '../domains/cats/services/agents/providers/relayclaw-sidecar.js';
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

export class DefaultRelayClawSecurityClient implements RelayClawSecurityClient {
  private readonly projectRoot: string;
  private readonly requestQueues = new Map<string, FrameQueue>();
  private readonly connection: RelayClawConnection;
  private readonly sidecar: RelayClawSidecarController;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
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
    const runtime = await this.resolveRuntimeProfile();
    if (!runtime?.apiKey || !runtime.baseUrl) {
      throw new Error('relayclaw security proxy requires a bound OpenAI-compatible provider profile');
    }

    const url = await this.sidecar.ensureStarted({
      callbackEnv: {
        API_KEY: runtime.apiKey,
        API_BASE: runtime.baseUrl,
      },
    });
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
    const catConfig = catRegistry.tryGet(RELAYCLAW_CAT_ID)?.config;
    const appDir = resolveJiuwenClawAppDir();
    const executablePath = resolveJiuwenClawExecutable();
    const pythonBin = resolveJiuwenClawPythonBin(undefined, appDir);

    return {
      executablePath,
      appDir,
      pythonBin,
      homeDir: join(this.projectRoot, '.cat-cafe', 'relayclaw', RELAYCLAW_CAT_ID),
      modelName: typeof catConfig?.defaultModel === 'string' ? catConfig.defaultModel : undefined,
    };
  }

  private async resolveRuntimeProfile() {
    const catConfig = catRegistry.tryGet(RELAYCLAW_CAT_ID)?.config;
    const boundAccountRef = resolveBoundAccountRefForCat(
      this.projectRoot,
      RELAYCLAW_CAT_ID,
      (catConfig ?? null) as (typeof catConfig & { providerProfileId?: string }) | null,
    );
    return resolveRuntimeProviderProfileForClient(this.projectRoot, 'openai', boundAccountRef);
  }
}

export function createRelayClawSecurityClient(projectRoot: string): RelayClawSecurityClient {
  return new DefaultRelayClawSecurityClient(projectRoot);
}

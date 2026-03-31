import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ModelConfigBinding } from '../config/model-config-profiles.js';
import type { RuntimeAcpModelProfile } from '../config/acp-model-profiles.js';
import type { RuntimeProviderProfile } from '../config/provider-profiles.js';
import { resolveHuaweiMaaSRuntimeConfig } from '../integrations/huawei-maas.js';

const BUNDLED_AGENT_TEAMS_PATH_SEGMENTS = ['tools', 'python', 'Scripts', 'agent-teams.exe'] as const;

export function resolveBundledAgentTeamsExecutable(projectRoot: string): string {
  return resolve(projectRoot, ...BUNDLED_AGENT_TEAMS_PATH_SEGMENTS);
}

export function resolveEmbeddedAgentTeamsExecutable(
  projectRoot: string,
  executablePathOverride?: string | null,
): string {
  const trimmedOverride = executablePathOverride?.trim();
  if (!trimmedOverride) {
    return resolveBundledAgentTeamsExecutable(projectRoot);
  }
  return isAbsolute(trimmedOverride) ? trimmedOverride : resolve(projectRoot, trimmedOverride);
}

export function bundledAgentTeamsRuntimeAvailable(projectRoot: string): boolean {
  return existsSync(resolveBundledAgentTeamsExecutable(projectRoot));
}

export function embeddedAgentTeamsRuntimeAvailable(projectRoot: string, executablePathOverride?: string | null): boolean {
  return existsSync(resolveEmbeddedAgentTeamsExecutable(projectRoot, executablePathOverride));
}

export function buildEmbeddedAgentTeamsProviderProfile(
  projectRoot: string,
  executablePathOverride?: string | null,
): RuntimeProviderProfile {
  return {
    id: 'embedded-agentteams-runtime',
    kind: 'acp',
    authType: 'none',
    protocol: 'acp',
    command: resolveEmbeddedAgentTeamsExecutable(projectRoot, executablePathOverride),
    args: ['gateway', 'acp', 'stdio'],
    modelAccessMode: 'clowder_default_profile',
  };
}

export function buildEmbeddedAgentTeamsModelProfile(
  profile: RuntimeProviderProfile,
  defaultModel: string,
): RuntimeAcpModelProfile {
  const model = defaultModel.trim();
  if (!model) {
    throw new Error('embedded Agent Teams runtime requires a model');
  }
  if (profile.authType !== 'api_key' || profile.protocol !== 'openai' || !profile.baseUrl || !profile.apiKey) {
    throw new Error('embedded Agent Teams runtime requires an OpenAI-compatible API key provider profile');
  }
  const now = new Date().toISOString();
  return {
    id: `embedded-agentteams-model-${profile.id}`,
    displayName: `Agent Teams · ${profile.id}`,
    provider: 'openai_compatible',
    model,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildEmbeddedAgentTeamsModelProfileFromBinding(
  binding: ModelConfigBinding,
  defaultModel: string,
  userId: string,
): RuntimeAcpModelProfile {
  const model = defaultModel.trim();
  if (!model) {
    throw new Error('embedded Agent Teams runtime requires a model');
  }
  const now = new Date().toISOString();
  const displayName = binding.displayName?.trim() || binding.id;

  if (binding.protocol === 'openai') {
    if (!binding.baseUrl || !binding.apiKey) {
      throw new Error(`model config source "${binding.id}" is missing baseUrl or apiKey`);
    }
    return {
      id: `embedded-agentteams-model-${binding.id}`,
      displayName: `Agent Teams · ${displayName}`,
      provider: 'openai_compatible',
      model,
      baseUrl: binding.baseUrl,
      apiKey: binding.apiKey,
      ...(binding.headers ? { headers: binding.headers } : {}),
      createdAt: now,
      updatedAt: now,
    };
  }

  if (binding.protocol === 'huawei_maas') {
    const runtimeConfig = resolveHuaweiMaaSRuntimeConfig(userId);
    return {
      id: `embedded-agentteams-model-${binding.id}`,
      displayName: `Agent Teams · ${displayName}`,
      provider: 'openai_compatible',
      model,
      baseUrl: runtimeConfig.baseUrl,
      apiKey: runtimeConfig.apiKey,
      headers: runtimeConfig.defaultHeaders,
      createdAt: now,
      updatedAt: now,
    };
  }

  throw new Error(`embedded Agent Teams runtime does not support model config source "${binding.id}"`);
}

import { readFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { PluginHealthCheck, PluginManifest, PluginResourceDef, ValueConfigField } from '@cat-cafe/shared';
import { parse as parseYaml } from 'yaml';
import { getValueFields, parseConfigFields } from '../../infrastructure/config-field-parser.js';
import { resourceCapId } from './PluginRegistry.js';

const SYSTEM_ENV_DENYLIST_PREFIXES = [
  'CAT_CAFE_',
  'REDIS_',
  'DATABASE_',
  'API_SERVER_',
  'FRONTEND_',
  'PREVIEW_',
  'AGENT_KEY_',
  'JWT_',
  'SESSION_',
];

const SYSTEM_ENV_DENYLIST_EXACT = new Set(['NODE_OPTIONS', 'NODE_ENV', 'PATH', 'HOME', 'SHELL', 'PORT']);

const SUPPORTED_RESOURCE_TYPES = new Set(['skill', 'mcp', 'limb', 'schedule', 'agentProvider']);
const DEFERRED_RESOURCE_TYPES = new Set<string>();
const AGENT_PROVIDER_TRANSPORTS = new Set(['acp', 'cli-jsonl']);
const AGENT_PROVIDER_SESSION_POLICIES = new Set(['resume', 'stateless']);
const AGENT_PROVIDER_OUTPUT_PROFILES = new Set(['clowder-code-turn-result-v1']);
const AGENT_PROVIDER_SANDBOX_REQUESTS = new Set(['workspace-read', 'workspace-write']);
const AGENT_PROVIDER_HEALTH_CHECK_TYPES = new Set(['acpInitialize', 'cliProbe']);

type AgentProviderResource = NonNullable<PluginResourceDef['agentProvider']>;

export const BUILTIN_PLUGIN_IDS = new Set<string>();

export interface EnvSafetyResult {
  ok: boolean;
  errors: string[];
}

function isSystemEnv(envName: string): boolean {
  const upper = envName.toUpperCase();
  if (SYSTEM_ENV_DENYLIST_EXACT.has(upper)) return true;
  return SYSTEM_ENV_DENYLIST_PREFIXES.some((p) => upper.startsWith(p));
}

function isUnsafeResourcePath(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path) || path.split(/[\\/]+/).includes('..');
}

function requireNonBlankString(value: unknown, fieldName: string, yamlPath: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`AgentProvider resource in ${yamlPath} must have a non-empty '${fieldName}' field`);
  }
  return value.trim();
}

function parseStringArrayField(value: unknown, fieldName: string, yamlPath: string): string[] {
  if (!Array.isArray(value) || !value.every((arg) => typeof arg === 'string' && arg.length > 0)) {
    throw new Error(`Invalid agentProvider ${fieldName} in ${yamlPath}: must be an array of non-empty strings`);
  }
  return value as string[];
}

function parseOptionalStringArrayField(value: unknown, fieldName: string, yamlPath: string): string[] | undefined {
  if (value === undefined) return undefined;
  return parseStringArrayField(value, fieldName, yamlPath);
}

function parseAgentProviderHealthCheck(
  value: unknown,
  yamlPath: string,
): AgentProviderResource['healthCheck'] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid agentProvider healthCheck in ${yamlPath}: must be an object`);
  }
  const rawType = (value as Record<string, unknown>).type;
  if (typeof rawType !== 'string' || !AGENT_PROVIDER_HEALTH_CHECK_TYPES.has(rawType)) {
    throw new Error(`Invalid agentProvider healthCheck.type in ${yamlPath}: must be 'acpInitialize' or 'cliProbe'`);
  }
  return { type: rawType as NonNullable<AgentProviderResource['healthCheck']>['type'] };
}

function parseAgentProviderTransport(
  raw: Record<string, unknown>,
  yamlPath: string,
): AgentProviderResource['transport'] {
  const transport = requireNonBlankString(raw.transport, 'transport', yamlPath);
  if (!AGENT_PROVIDER_TRANSPORTS.has(transport)) {
    throw new Error(`Invalid agentProvider transport '${transport}' in ${yamlPath}`);
  }
  return transport as AgentProviderResource['transport'];
}

function parseAgentProviderSessionPolicy(
  value: unknown,
  yamlPath: string,
): AgentProviderResource['sessionPolicy'] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !AGENT_PROVIDER_SESSION_POLICIES.has(value)) {
    throw new Error(`Invalid agentProvider sessionPolicy in ${yamlPath}: must be 'resume' or 'stateless'`);
  }
  return value as AgentProviderResource['sessionPolicy'];
}

function parseAgentProviderOutputProfile(
  value: unknown,
  yamlPath: string,
): AgentProviderResource['outputProfile'] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !AGENT_PROVIDER_OUTPUT_PROFILES.has(value)) {
    throw new Error(`Invalid agentProvider outputProfile in ${yamlPath}: must be 'clowder-code-turn-result-v1'`);
  }
  return value as AgentProviderResource['outputProfile'];
}

function parseAgentProviderSessionFields(
  raw: Record<string, unknown>,
  transport: AgentProviderResource['transport'],
  yamlPath: string,
): Pick<AgentProviderResource, 'resumeArgs' | 'sessionPolicy' | 'outputProfile'> {
  const resumeArgs = parseOptionalStringArrayField(raw.resumeArgs, 'resumeArgs', yamlPath);
  const sessionPolicy = parseAgentProviderSessionPolicy(raw.sessionPolicy, yamlPath);
  const outputProfile = parseAgentProviderOutputProfile(raw.outputProfile, yamlPath);
  if (transport === 'cli-jsonl') {
    return validateCliJsonlSessionFields(resumeArgs, sessionPolicy, outputProfile, yamlPath);
  }
  rejectAcpCliJsonlOnlyFields(resumeArgs, sessionPolicy, outputProfile, yamlPath);
  return {};
}

function validateCliJsonlSessionFields(
  resumeArgs: string[] | undefined,
  sessionPolicy: AgentProviderResource['sessionPolicy'],
  outputProfile: AgentProviderResource['outputProfile'],
  yamlPath: string,
): Pick<AgentProviderResource, 'resumeArgs' | 'sessionPolicy' | 'outputProfile'> {
  if (!sessionPolicy) {
    throw new Error(`AgentProvider cli-jsonl resource in ${yamlPath} must have a 'sessionPolicy' field`);
  }
  if (!outputProfile) {
    throw new Error(`AgentProvider cli-jsonl resource in ${yamlPath} must have an 'outputProfile' field`);
  }
  if (sessionPolicy === 'resume' && !resumeArgs?.some((arg) => arg.includes('{sessionId}'))) {
    throw new Error(`AgentProvider cli-jsonl resumeArgs in ${yamlPath} must include '{sessionId}'`);
  }
  return {
    ...(resumeArgs ? { resumeArgs } : {}),
    sessionPolicy,
    outputProfile,
  };
}

function rejectAcpCliJsonlOnlyFields(
  resumeArgs: string[] | undefined,
  sessionPolicy: AgentProviderResource['sessionPolicy'],
  outputProfile: AgentProviderResource['outputProfile'],
  yamlPath: string,
): void {
  if (resumeArgs !== undefined || sessionPolicy !== undefined || outputProfile !== undefined) {
    throw new Error(`AgentProvider acp resource in ${yamlPath} must not declare cli-jsonl-only fields`);
  }
}

function parseAgentProviderTimeoutMs(value: unknown, yamlPath: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid agentProvider timeoutMs in ${yamlPath}: must be a non-negative integer`);
  }
  return value;
}

function parseAgentProviderMcpWhitelistRequest(value: unknown, yamlPath: string): string[] | undefined {
  if (value === undefined) return undefined;
  const mcpWhitelistRequest = parseStringArrayField(value, 'mcpWhitelist', yamlPath);
  if (new Set(mcpWhitelistRequest).size !== mcpWhitelistRequest.length) {
    throw new Error(`Invalid agentProvider mcpWhitelist in ${yamlPath}: duplicate entries are not allowed`);
  }
  return mcpWhitelistRequest;
}

function parseAgentProviderSandboxRequest(
  value: unknown,
  yamlPath: string,
): AgentProviderResource['sandboxRequest'] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !AGENT_PROVIDER_SANDBOX_REQUESTS.has(value)) {
    throw new Error(`Invalid agentProvider sandbox in ${yamlPath}: must be 'workspace-read' or 'workspace-write'`);
  }
  return value as AgentProviderResource['sandboxRequest'];
}

function parseAgentProviderResource(
  raw: Record<string, unknown>,
  name: string | undefined,
  yamlPath: string,
): AgentProviderResource {
  if (!name || name.trim().length === 0) {
    throw new Error(`AgentProvider resource in ${yamlPath} must have a 'name' field`);
  }
  if (/[/\\]/.test(name)) {
    throw new Error(`AgentProvider resource name '${name}' in ${yamlPath} must not contain path separators (/ or \\)`);
  }

  const transport = parseAgentProviderTransport(raw, yamlPath);
  const command = requireNonBlankString(raw.command, 'command', yamlPath);
  const startupArgs = parseStringArrayField(raw.startupArgs, 'startupArgs', yamlPath);
  const sessionFields = parseAgentProviderSessionFields(raw, transport, yamlPath);
  const timeoutMs = parseAgentProviderTimeoutMs(raw.timeoutMs, yamlPath);
  const mcpWhitelistRequest = parseAgentProviderMcpWhitelistRequest(raw.mcpWhitelist, yamlPath);
  const sandboxRequest = parseAgentProviderSandboxRequest(raw.sandbox, yamlPath);
  const healthCheck = parseAgentProviderHealthCheck(raw.healthCheck, yamlPath);

  return {
    name,
    transport,
    command,
    startupArgs,
    ...sessionFields,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(mcpWhitelistRequest ? { mcpWhitelistRequest } : {}),
    ...(sandboxRequest ? { sandboxRequest } : {}),
    ...(healthCheck ? { healthCheck } : {}),
  };
}

function envClaimKey(envName: string): string {
  return envName.toUpperCase();
}

export function validateEnvSafety(manifest: PluginManifest, existingClaims: Map<string, string>): EnvSafetyResult {
  const errors: string[] = [];
  const pluginPrefix = manifest.id.toUpperCase().replace(/-/g, '_') + '_';
  const normalizedClaims = new Map<string, string>();
  for (const [envName, pluginId] of existingClaims) {
    normalizedClaims.set(envClaimKey(envName), pluginId);
  }

  for (const field of manifest.config) {
    if (isSystemEnv(field.envName)) {
      errors.push(`'${field.envName}' is a reserved system variable`);
      continue;
    }

    if (!manifest.builtin && !field.envName.toUpperCase().startsWith(pluginPrefix)) {
      errors.push(`Community plugin '${manifest.id}' env '${field.envName}' must start with '${pluginPrefix}'`);
      continue;
    }

    const owner = normalizedClaims.get(envClaimKey(field.envName));
    if (owner && owner !== manifest.id) {
      errors.push(`'${field.envName}' already claimed by plugin '${owner}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parsePluginManifest(yamlPath: string): PluginManifest {
  const raw = readFileSync(yamlPath, 'utf-8');
  const doc = parseYaml(raw) as Record<string, unknown>;

  const id = doc['id'];
  const name = doc['name'];
  const version = doc['version'];
  if (typeof id !== 'string' || typeof name !== 'string' || typeof version !== 'string') {
    throw new Error(`Invalid plugin manifest at ${yamlPath}: id, name, and version must be strings`);
  }
  if (!/^[a-z]([a-z0-9-]*[a-z0-9])?$/.test(id)) {
    throw new Error(
      `Invalid plugin id '${id}': must start with a letter, contain only a-z, 0-9, hyphens, no trailing hyphen`,
    );
  }

  // F240 KD-15: use shared parser, plugins only have value fields (no operations)
  const rawConfig = doc['config'];
  let config: ValueConfigField[];
  if (Array.isArray(rawConfig)) {
    const allFields = parseConfigFields(rawConfig, `${yamlPath}/config`);
    config = getValueFields(allFields);
    // Warn if someone puts operation fields in a plugin.yaml (not supported)
    if (config.length < allFields.length) {
      console.warn(`[PluginManifest] ${yamlPath}: operation fields are not supported in plugin.yaml, skipped`);
    }
  } else {
    config = [];
  }

  const resources: PluginResourceDef[] = [];
  const rawResources = doc['resources'];
  if (Array.isArray(rawResources)) {
    for (const r of rawResources) {
      const rr = r as Record<string, unknown>;
      const rawType = rr['type'];
      if (typeof rawType !== 'string') {
        throw new Error(`Invalid resource entry in ${yamlPath}: type must be a string`);
      }
      const type = rawType;
      if (DEFERRED_RESOURCE_TYPES.has(type)) {
        console.warn(`[PluginManifest] resource type '${type}' not yet supported, skipping`);
        continue;
      }
      if (!SUPPORTED_RESOURCE_TYPES.has(type)) {
        throw new Error(`Unsupported resource type '${type}' in ${yamlPath}`);
      }

      const rawPath = rr['path'];
      if (rawPath != null && typeof rawPath !== 'string') {
        throw new Error(`Invalid resource path in ${yamlPath}: must be a string`);
      }
      const path = rawPath as string | undefined;
      if (path && isUnsafeResourcePath(path)) {
        throw new Error(`Invalid resource path '${path}': must be relative without '..'`);
      }

      const rawArgs = rr['args'];
      let args: string[] | undefined;
      if (rawArgs != null) {
        if (!Array.isArray(rawArgs) || !rawArgs.every((a) => typeof a === 'string')) {
          throw new Error(`Invalid resource args in ${yamlPath}: must be an array of strings`);
        }
        args = rawArgs as string[];
      }

      const command = rr['command'];
      if (command != null && typeof command !== 'string') {
        throw new Error(`Invalid resource command in ${yamlPath}: must be a string`);
      }

      const rawTransport = rr['transport'];
      if (rawTransport != null && typeof rawTransport !== 'string') {
        throw new Error(`Invalid resource transport in ${yamlPath}: must be a string`);
      }
      const transport = rawTransport as PluginResourceDef['transport'] | undefined;
      if (type === 'mcp' && transport && transport !== 'stdio' && transport !== 'streamableHttp') {
        throw new Error(`Invalid MCP resource transport in ${yamlPath}: must be 'stdio' or 'streamableHttp'`);
      }

      const url = rr['url'];
      if (url != null && typeof url !== 'string') {
        throw new Error(`Invalid resource url in ${yamlPath}: must be a string`);
      }

      const rawName = rr['name'];
      if (rawName != null && typeof rawName !== 'string') {
        throw new Error(`Invalid resource name in ${yamlPath}: must be a string`);
      }
      const name = rawName as string | undefined;
      if ((type === 'skill' || type === 'limb') && !path) {
        const label = type === 'skill' ? 'Skill' : 'Limb';
        throw new Error(`${label} resource in ${yamlPath} must have a 'path' field`);
      }
      if (type === 'mcp' && !name) {
        throw new Error(`MCP resource in ${yamlPath} must have a 'name' field for unique capability ID`);
      }
      if (type === 'mcp' && name && /[/\\]/.test(name)) {
        throw new Error(`MCP resource name '${name}' in ${yamlPath} must not contain path separators (/ or \\)`);
      }
      if (type === 'mcp' && transport === 'streamableHttp' && (!url || url.trim().length === 0)) {
        throw new Error(`MCP streamableHttp resource in ${yamlPath} must have a 'url' field`);
      }
      if (type === 'mcp' && transport !== 'streamableHttp' && !command) {
        throw new Error(`MCP resource in ${yamlPath} must have a 'command' field`);
      }

      // F202 Phase 2: schedule resource validation — factoryId + name required
      const rawFactoryId = rr['factoryId'];
      if (rawFactoryId != null && typeof rawFactoryId !== 'string') {
        throw new Error(`Invalid resource factoryId in ${yamlPath}: must be a string`);
      }
      const factoryId = rawFactoryId as string | undefined;
      if (type === 'schedule') {
        if (!factoryId || factoryId.trim().length === 0) {
          throw new Error(`Schedule resource in ${yamlPath} must have a 'factoryId' field`);
        }
        if (!name) {
          throw new Error(`Schedule resource in ${yamlPath} must have a 'name' field`);
        }
        // P2-2: Backslash in schedule name causes normalizeCapId / resourceCapId mismatch.
        // normalizeCapId converts \ → / but resourceCapId uses raw name, so stored
        // "plugin:p:a\b" won't match lookup "plugin:p:a/b" → disable/cleanup misses it.
        if (/\\/.test(name)) {
          throw new Error(`Schedule resource name "${name}" in ${yamlPath} must not contain backslashes`);
        }
      }
      const agentProvider = type === 'agentProvider' ? parseAgentProviderResource(rr, name, yamlPath) : undefined;

      // F202 Phase 2 follow-up: parse optional flag for resources
      const optional = rr['optional'] === true;

      resources.push({
        type: type as PluginResourceDef['type'],
        ...(type === 'schedule' && factoryId ? { factoryId } : {}),
        ...(agentProvider ? { agentProvider } : {}),
        ...(optional ? { optional } : {}),
        path,
        name,
        command: command as string | undefined,
        args,
        transport,
        url: url as string | undefined,
      });
    }
  }

  const seenCapIds = new Set<string>();
  for (const res of resources) {
    const capId = resourceCapId(id, res);
    if (seenCapIds.has(capId)) {
      throw new Error(`Duplicate resource capability ID '${capId}' in ${yamlPath}`);
    }
    seenCapIds.add(capId);
  }

  let healthCheck: PluginHealthCheck | undefined;
  const rawHC = doc['healthCheck'] as Record<string, unknown> | undefined;
  if (rawHC) {
    const limbCommand = rawHC['limbCommand'] as string | undefined;
    const mcpProbe = rawHC['mcpProbe'] as string | undefined;
    if (limbCommand || mcpProbe) {
      healthCheck = { limbCommand, mcpProbe };
    }
  }

  const docsUrl = typeof doc['docsUrl'] === 'string' ? doc['docsUrl'] : undefined;
  const rawSteps = doc['setupSteps'];
  const setupSteps = Array.isArray(rawSteps) ? rawSteps.filter((s): s is string => typeof s === 'string') : undefined;

  return {
    id,
    name,
    version,
    description: typeof doc['description'] === 'string' ? doc['description'] : undefined,
    icon: typeof doc['icon'] === 'string' ? doc['icon'] : undefined,
    iconBg: typeof doc['iconBg'] === 'string' ? doc['iconBg'] : undefined,
    builtin: false,
    docsUrl,
    setupSteps: setupSteps && setupSteps.length > 0 ? setupSteps : undefined,
    config,
    healthCheck,
    resources,
  };
}

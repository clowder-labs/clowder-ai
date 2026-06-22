import type { PluginResourceDef } from '@cat-cafe/shared';

const AGENT_PROVIDER_TRANSPORTS = new Set(['acp', 'cli-jsonl']);
const AGENT_PROVIDER_SESSION_POLICIES = new Set(['resume', 'stateless']);
const AGENT_PROVIDER_OUTPUT_PROFILES = new Set(['clowder-code-turn-result-v1']);
const AGENT_PROVIDER_SANDBOX_REQUESTS = new Set(['workspace-read', 'workspace-write']);
const AGENT_PROVIDER_HEALTH_CHECK_TYPES = new Set(['acpInitialize', 'cliProbe']);

type AgentProviderResource = NonNullable<PluginResourceDef['agentProvider']>;

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

export function parseAgentProviderResource(
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

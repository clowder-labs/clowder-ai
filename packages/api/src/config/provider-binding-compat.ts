import type { CatProvider } from '@clowder/shared';
import { createModuleLogger } from '../infrastructure/logger.js';
import { getPluginRegistry } from './plugins/plugin-registry-singleton.js';
import type {
  BuiltinAccountClient,
  ProviderProfileKind,
  ProviderProfileProtocol,
  RuntimeProviderProfile,
} from './provider-profiles.types.js';

const log = createModuleLogger('provider-binding');

export function resolveBuiltinClientForProvider(provider: CatProvider): BuiltinAccountClient | null {
  const plugin = getPluginRegistry().get(provider);
  if (plugin?.binding?.builtinClient) {
    return plugin.binding.builtinClient;
  }
  return null;
}

function resolveExpectedProtocolForProvider(provider: CatProvider): ProviderProfileProtocol | null {
  const plugin = getPluginRegistry().get(provider);
  if (plugin?.binding?.expectedProtocol) {
    return plugin.binding.expectedProtocol as ProviderProfileProtocol;
  }
  return null;
}

/**
 * Returns an error string when the opencode provider binding is incomplete.
 */
export function validateModelFormatForProvider(
  provider: CatProvider,
  defaultModel?: string | null,
  profileKind?: ProviderProfileKind,
  ocProviderName?: string | null,
): string | null {
  if (provider !== 'opencode') return null;
  const trimmedModel = defaultModel?.trim();
  if (!trimmedModel) return null;
  if (profileKind === 'api_key') {
    if (!ocProviderName?.trim()) {
      return 'client "opencode" with API key auth requires an OpenCode Provider name (e.g. anthropic, openai, maas)';
    }
    return null;
  }
  const slashIndex = trimmedModel.indexOf('/');
  if (slashIndex > 0 && slashIndex < trimmedModel.length - 1) return null;
  return 'client "opencode" recommends model format "providerId/modelId" (e.g. openai/gpt-5.4)';
}

export function validateRuntimeProviderBinding(
  provider: CatProvider,
  profile: RuntimeProviderProfile,
  defaultModel?: string | null,
  options?: { embeddedAcpRuntime?: boolean },
): string | null {
  // Check plugin-specific validation first
  const plugin = getPluginRegistry().get(provider);
  if (plugin?.validateBinding) {
    const result = plugin.validateBinding(provider, profile, defaultModel, options);
    if (result !== null) return result;
    // Fall through to generic checks — plugin-specific passed but still
    // need to verify builtin client, protocol, and model compatibility
  }

  // Generic: builtin client mismatch
  const expectedClient = resolveBuiltinClientForProvider(provider);
  if (expectedClient && profile.kind === 'builtin' && profile.client && profile.client !== expectedClient) {
    return `bound provider profile "${profile.id}" is incompatible with client "${provider}"`;
  }

  // Generic: protocol mismatch
  const expectedProtocol = resolveExpectedProtocolForProvider(provider);
  if (expectedProtocol && profile.protocol && profile.protocol !== expectedProtocol) {
    return `provider "${provider}" expects protocol "${expectedProtocol}" but profile "${profile.id}" uses "${profile.protocol}"`;
  }

  // Generic: model not available on builtin account
  const trimmedModel = defaultModel?.trim().replace(/\x1B\[[^m]*m|\[\d+m\]/g, '');
  if (trimmedModel && profile.kind === 'builtin' && profile.models?.length && !profile.models.includes(trimmedModel)) {
    return `model "${trimmedModel}" is not available on provider "${profile.id}"`;
  }

  return null;
}

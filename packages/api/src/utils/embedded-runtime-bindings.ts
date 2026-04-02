import type { RuntimeAcpModelProfile } from '../config/acp-model-profiles.js';
import { resolveRuntimeAcpModelProfileById } from '../config/acp-model-profiles.js';
import type { RuntimeProviderProfile } from '../config/provider-profiles.js';
import { validateRuntimeProviderBinding } from '../config/provider-binding-compat.js';
import { resolveRuntimeProviderProfileById, resolveRuntimeProviderProfileForClient } from '../config/provider-profiles.js';

export async function resolveEmbeddedAgentTeamsBinding(
  projectRoot: string,
  accountRef?: string | null,
): Promise<{ accountRef: string; profile: RuntimeProviderProfile } | null> {
  const trimmedAccountRef = accountRef?.trim();
  if (trimmedAccountRef) {
    const profile = await resolveRuntimeProviderProfileById(projectRoot, trimmedAccountRef);
    if (!profile) return null;
    const compatibilityError = validateRuntimeProviderBinding('acp', profile, undefined, {
      embeddedAcpRuntime: true,
    });
    if (compatibilityError) return null;
    return { accountRef: trimmedAccountRef, profile };
  }

  const inheritedProfile = await resolveRuntimeProviderProfileForClient(projectRoot, 'openai');
  if (!inheritedProfile) return null;
  const compatibilityError = validateRuntimeProviderBinding('acp', inheritedProfile, undefined, {
    embeddedAcpRuntime: true,
  });
  if (compatibilityError) return null;
  return { accountRef: inheritedProfile.id, profile: inheritedProfile };
}

export async function resolveEmbeddedAgentTeamsLegacyModelProfile(
  projectRoot: string,
  accountRef?: string | null,
): Promise<RuntimeAcpModelProfile | null> {
  const trimmedAccountRef = accountRef?.trim();
  if (!trimmedAccountRef) return null;

  const profile = await resolveRuntimeProviderProfileById(projectRoot, trimmedAccountRef);
  if (!profile || profile.kind !== 'acp' || profile.authType !== 'none' || profile.protocol !== 'acp') {
    return null;
  }

  const modelProfileRef = profile.defaultModelProfileRef?.trim();
  if (!modelProfileRef) return null;
  return resolveRuntimeAcpModelProfileById(projectRoot, modelProfileRef);
}

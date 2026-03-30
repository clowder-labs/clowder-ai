import type { RuntimeProviderProfile } from '../../../../../config/provider-profiles.js';

export interface ACPModelProfileOverridePayload {
  name: 'default';
  model: string;
  baseUrl: string;
  apiKey: string;
}

export function buildACPModelProfileOverridePayload(
  profile: RuntimeProviderProfile,
  defaultModel: string,
): ACPModelProfileOverridePayload {
  if (profile.kind !== 'api_key' || profile.authType !== 'api_key' || !profile.baseUrl || !profile.apiKey) {
    throw new Error('ACP bound provider profile is incomplete');
  }
  return {
    name: 'default',
    model: defaultModel,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
  };
}

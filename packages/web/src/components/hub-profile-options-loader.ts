import { apiFetch } from '@/utils/api-client';
import type { ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';

interface ModelConfigProfilesResponse {
  projectPath: string;
  fallbackToProviderProfiles?: boolean;
  exists: boolean;
  providers: ProfileItem[];
}

export function buildProjectScopedUrl(path: string, projectPath: string | null | undefined): string {
  if (!projectPath || projectPath === 'default') return path;
  const query = new URLSearchParams({ projectPath });
  return `${path}?${query.toString()}`;
}

function mergeProfiles(modelConfigProfiles: ProfileItem[], providerProfiles: ProfileItem[]): ProfileItem[] {
  const merged = new Map<string, ProfileItem>();
  for (const profile of [...modelConfigProfiles, ...providerProfiles]) {
    if (!merged.has(profile.id)) merged.set(profile.id, profile);
  }
  return [...merged.values()];
}

async function fetchProviderProfiles(providerProfilesUrl: string): Promise<ProfileItem[]> {
  const providerProfilesRes = await apiFetch(providerProfilesUrl);
  if (!providerProfilesRes.ok) throw new Error(`账号配置加载失败 (${providerProfilesRes.status})`);
  const providerProfilesBody = (await providerProfilesRes.json()) as ProviderProfilesResponse;
  return providerProfilesBody.providers;
}

export async function loadSelectableProfiles(projectPath: string | null | undefined): Promise<ProfileItem[]> {
  const modelConfigUrl = '/api/model-config-profiles';
  const providerProfilesUrl = buildProjectScopedUrl('/api/provider-profiles', projectPath);

  let modelConfigRes: Response;
  try {
    modelConfigRes = await apiFetch(modelConfigUrl);
  } catch {
    return fetchProviderProfiles(providerProfilesUrl);
  }

  if (!modelConfigRes.ok) {
    if (modelConfigRes.status === 404) return [];
    throw new Error(`模型配置加载失败 (${modelConfigRes.status})`);
  }

  const body = (await modelConfigRes.json()) as ModelConfigProfilesResponse;
  if (!body.exists) {
    if (!body.fallbackToProviderProfiles) return [];
    return fetchProviderProfiles(providerProfilesUrl);
  }

  try {
    const providerProfiles = await fetchProviderProfiles(providerProfilesUrl);
    return mergeProfiles(body.providers, providerProfiles);
  } catch {
    return body.providers;
  }
}

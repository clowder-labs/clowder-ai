'use client';

import { HubAcpModelProfilesSection } from './HubAcpModelProfilesSection';
import { HubProviderProfileItem } from './HubProviderProfileItem';
import { CreateAcpModelProfileSection, CreateApiKeyProfileSection, ProviderProfilesSummaryCard } from './hub-provider-profiles.sections';
import type { ProfileItem } from './hub-provider-profiles.types';
import { resolveAccountActionId } from './hub-provider-profiles.view';
import { useProviderProfilesState } from './useProviderProfilesState';

function resolveProviderGroupName(profile: ProfileItem): string {
  const source = `${profile.provider ?? ''} ${profile.displayName} ${profile.name}`.toLowerCase();
  if (source.includes('deepseek')) return 'DeepSeek';
  if (source.includes('qwen') || source.includes('maas') || source.includes('huawei')) {
    return 'Huawei MaaS';
  }
  if (source.includes('kimi')) return 'Kimi';
  if (source.includes('openai') || source.includes('codex')) return 'OpenAI';
  if (source.includes('claude') || source.includes('anthropic')) return 'Anthropic';
  if (source.includes('gemini') || source.includes('google')) return 'Google';
  return profile.provider || profile.name || 'Others';
}

export function HubProviderProfilesTab() {
  const {
    loading,
    error,
    data,
    busyId,
    displayCards,
    acpModelProfiles,
    isProfileBusy,
    providerCreateSectionProps,
    acpModelCreateSectionProps,
    saveProfile,
    deleteProfile,
    testProfile,
    saveAcpModelProfile,
    deleteAcpModelProfile,
  } = useProviderProfilesState();

  if (loading) return <p className="text-sm text-gray-400">{'\u52a0\u8f7d\u4e2d...'}</p>;
  if (!data) return <p className="text-sm text-gray-400">{'\u6682\u65e0\u6570\u636e'}</p>;

  const groupedCards = displayCards.reduce<Array<{ name: string; items: ProfileItem[] }>>((acc, profile) => {
    const groupName = resolveProviderGroupName(profile);
    const existing = acc.find((entry) => entry.name === groupName);
    if (existing) {
      existing.items.push(profile);
      return acc;
    }
    acc.push({ name: groupName, items: [profile] });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p> : null}

      <ProviderProfilesSummaryCard />

      <div role="group" aria-label="Provider Profile List" className="space-y-4">
        {groupedCards.map((group) => (
          <section key={group.name} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#3B4452]">
                <svg className="h-3.5 w-3.5 text-[#8C96A5]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 12 4-4 4 4" />
                </svg>
                {group.name} ({group.items.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {group.items.map((profile) => (
                <HubProviderProfileItem
                  key={profile.id}
                  profile={profile}
                  acpModelProfiles={acpModelProfiles}
                  busy={isProfileBusy(profile)}
                  onSave={(payload) => saveProfile(resolveAccountActionId(profile), payload)}
                  onDelete={() => deleteProfile(resolveAccountActionId(profile))}
                  onTest={() => testProfile(resolveAccountActionId(profile))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <CreateApiKeyProfileSection {...providerCreateSectionProps} />

      <HubAcpModelProfilesSection
        profiles={acpModelProfiles}
        busyId={busyId}
        onSave={saveAcpModelProfile}
        onDelete={deleteAcpModelProfile}
      />

      <CreateAcpModelProfileSection {...acpModelCreateSectionProps} />

      <p className="text-xs leading-5 text-[#B59A88]">
        secrets are stored in `.cat-cafe/provider-profiles.secrets.local.json` and
        `.cat-cafe/acp-model-profiles.secrets.local.json`.
      </p>
    </div>
  );
}


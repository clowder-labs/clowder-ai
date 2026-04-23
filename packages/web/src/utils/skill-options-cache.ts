/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { apiFetch } from './api-client';

export interface SkillOption {
  name: string;
  iconUrl?: string | null;
}

interface CapabilitySkillItem {
  id: string;
  type: 'mcp' | 'skill' | 'limb';
}

interface CapabilitiesResponseLite {
  items?: CapabilitySkillItem[];
}

const SKILL_CACHE_TTL_MS = 5 * 60 * 1000;
export const SKILL_OPTIONS_UPDATED_EVENT = 'office-claw:skill-options-updated';

let cachedSkillOptions: SkillOption[] | null = null;
let cachedSkillOptionsAt = 0;
let skillOptionsInFlight: Promise<SkillOption[]> | null = null;
let skillOptionsEpoch = 0;

export function getCachedSkillOptions(): SkillOption[] | null {
  const now = Date.now();
  if (!cachedSkillOptions) return null;
  if (now - cachedSkillOptionsAt >= SKILL_CACHE_TTL_MS) return null;
  return cachedSkillOptions;
}

export function seedSkillOptionsCache(options: SkillOption[]): void {
  const deduped = Array.from(
    new Map(
      options
        .map((item) => ({
          name: item.name.trim(),
          iconUrl: item.iconUrl ?? null,
        }))
        .filter((item) => item.name.length > 0)
        .map((item) => [item.name, item] as const),
    ).values(),
  );
  cachedSkillOptions = deduped;
  cachedSkillOptionsAt = Date.now();
}

export function invalidateSkillOptionsCache(): void {
  cachedSkillOptions = null;
  cachedSkillOptionsAt = 0;
  skillOptionsEpoch += 1;
  skillOptionsInFlight = null;
}

export function notifySkillOptionsChanged(): void {
  invalidateSkillOptionsCache();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SKILL_OPTIONS_UPDATED_EVENT));
}

export async function fetchSkillOptionsWithCache(options?: { force?: boolean }): Promise<SkillOption[]> {
  const force = options?.force === true;
  const cached = getCachedSkillOptions();
  if (!force && cached) return cached;
  if (!force && skillOptionsInFlight) return skillOptionsInFlight;

  const requestEpoch = skillOptionsEpoch;

  const request = (async () => {
    try {
      const res = await apiFetch('/api/capabilities?probe=true');
      if (!res.ok) return [];
      const data = (await res.json()) as CapabilitiesResponseLite;
      const names = Array.from(
        new Set(
          (data.items ?? [])
            .filter((item) => item.type === 'skill' && typeof item.id === 'string' && item.id.trim().length > 0)
            .map((item) => item.id.trim()),
        ),
      );
      const options = names.map((name) => ({ name }));
      if (skillOptionsEpoch === requestEpoch) {
        seedSkillOptionsCache(options);
      }
      return options;
    } catch {
      return [];
    } finally {
      if (skillOptionsInFlight === request) {
        skillOptionsInFlight = null;
      }
    }
  })();

  if (!force) {
    skillOptionsInFlight = request;
  }

  return request;
}

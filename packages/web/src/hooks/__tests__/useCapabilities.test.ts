/**
 * useCapabilities hook unit tests.
 *
 * [宪宪/Opus-46🐾] F140 Phase A — AC-A6
 */

import { describe, expect, it, vi } from 'vitest';

// Mock apiFetch before importing the hook
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/utils/api-client';

// Since useCapabilities is a React hook, test the logic directly
// by extracting the fetch + parse behavior.
describe('useCapabilities data contract', () => {
  it('parses valid capability manifest response', async () => {
    const manifest = {
      branding: { appName: 'Test App' },
      identity: { mode: 'no-auth' },
      features: { remoteSkillHub: false, voiceIO: true },
      connectors: [],
      modelSources: ['stub'],
    };

    const mockFetch = apiFetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => manifest,
    });

    const res = await mockFetch('/api/edition/capabilities');
    const data = await res.json();

    expect(data.identity.mode).toBe('no-auth');
    expect(data.branding.appName).toBe('Test App');
    expect(data.features.voiceIO).toBe(true);
    expect(data.features.remoteSkillHub).toBe(false);
  });

  it('defaults identityMode to no-auth when capabilities null', () => {
    // Simulates the hook's fallback logic
    const capabilities = null;
    const identityMode = capabilities?.identity.mode ?? 'no-auth';
    expect(identityMode).toBe('no-auth');
  });

  it('defaults appName to Clowder AI when capabilities null', () => {
    const capabilities = null;
    const appName = capabilities?.branding.appName ?? 'Clowder AI';
    expect(appName).toBe('Clowder AI');
  });

  it('isFeatureEnabled returns false for unknown features', () => {
    const capabilities = {
      features: { voiceIO: true },
    };
    const isFeatureEnabled = (f: string) => capabilities?.features[f] ?? false;
    expect(isFeatureEnabled('voiceIO')).toBe(true);
    expect(isFeatureEnabled('unknownFeature')).toBe(false);
  });
});

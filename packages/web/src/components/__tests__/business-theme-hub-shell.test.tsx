import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubCapabilityTab } from '@/components/HubCapabilityTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/useConfirm', () => ({
  useConfirm: () => vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/components/useProviderProfilesState', () => ({
  useProviderProfilesState: () => ({ providerCreateSectionProps: {} }),
}));
vi.mock('@/components/hub-provider-profiles.sections', () => ({
  CreateApiKeyProfileSection: () => React.createElement('div', { 'data-testid': 'provider-create-section' }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: { threads: Array<{ projectPath?: string }> }) => unknown) => {
    const state = { threads: [{ projectPath: 'project-a' }, { projectPath: 'project-b' }] };
    return selector ? selector(state) : state;
  },
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('business theme hub shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            catFamilies: [{ id: 'ops', name: 'Ops', catIds: ['office'] }],
            items: [
              {
                id: 'ops-skill',
                type: 'skill',
                source: 'cat-cafe',
                enabled: true,
                cats: { office: true },
                description: 'automation helper',
                triggers: ['ops'],
                category: 'Automation',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
            ],
            skillHealth: {
              allMounted: true,
              registrationConsistent: true,
              unregistered: [],
              phantom: [],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders HubCapabilityTab capability cards without project selector', async () => {
    await act(async () => {
      root.render(React.createElement(HubCapabilityTab));
    });
    await flushEffects();

    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toContain('项目:');
    expect(container.querySelector('[data-testid="capability-card-skill-ops-skill"]')?.className).toContain('ui-card');
    expect(container.textContent).toContain('来源：官方');
    expect(container.textContent).toContain('启用状态');
  });
});

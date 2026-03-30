import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

import { CreateAgentModalDraft } from '@/components/CreateAgentModalDraft';

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

describe('CreateAgentModalDraft', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    useChatStore.getState().setCurrentProject('/tmp/project');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders client and auth selects and saves the selected binding', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/model-config-profiles') {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'global',
            exists: false,
            fallbackToProviderProfiles: true,
            providers: [],
          }),
        );
      }
      if (String(path).startsWith('/api/provider-profiles')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: '/tmp/project',
            activeProfileId: 'codex',
            providers: [
              {
                id: 'claude',
                provider: 'claude',
                displayName: 'Claude (OAuth)',
                name: 'Claude (OAuth)',
                authType: 'oauth',
                kind: 'builtin',
                builtin: true,
                client: 'anthropic',
                protocol: 'anthropic',
                models: ['claude-sonnet-4-6'],
                hasApiKey: false,
                createdAt: '2026-03-28T00:00:00.000Z',
                updatedAt: '2026-03-28T00:00:00.000Z',
              },
              {
                id: 'codex',
                provider: 'codex',
                displayName: 'Codex (OAuth)',
                name: 'Codex (OAuth)',
                authType: 'oauth',
                kind: 'builtin',
                builtin: true,
                client: 'openai',
                protocol: 'openai',
                models: ['gpt-5.4'],
                hasApiKey: false,
                createdAt: '2026-03-28T00:00:00.000Z',
                updatedAt: '2026-03-28T00:00:00.000Z',
              },
              {
                id: 'codex-sponsor',
                provider: 'codex-sponsor',
                displayName: 'Codex Sponsor',
                name: 'Codex Sponsor',
                authType: 'api_key',
                kind: 'api_key',
                builtin: false,
                mode: 'api_key',
                protocol: 'openai',
                models: ['gpt-5.4-mini'],
                hasApiKey: true,
                createdAt: '2026-03-28T00:00:00.000Z',
                updatedAt: '2026-03-28T00:00:00.000Z',
              },
            ],
          }),
        );
      }
      if (path === '/api/cats' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ cat: { id: 'agent-1' } }, 201));
      }
      throw new Error(`Unexpected apiFetch path: ${path}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModalDraft, {
          open: true,
          name: '测试智能体',
          description: 'desc',
          draft: {
            client: 'openai',
            accountRef: 'codex-sponsor',
            defaultModel: 'gpt-5.4-mini',
          },
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const clientSelect = container.querySelector('select[aria-label="Client"]') as HTMLSelectElement | null;
    const accountSelect = container.querySelector('select[aria-label="认证信息"]') as HTMLSelectElement | null;
    const modelButton = container.querySelector('button[aria-label="Model"]') as HTMLButtonElement | null;

    expect(clientSelect).not.toBeNull();
    expect(accountSelect).not.toBeNull();
    expect(clientSelect?.value).toBe('openai');
    expect(accountSelect?.value).toBe('codex-sponsor');
    expect(modelButton?.textContent).toContain('gpt-5.4-mini');

    const saveButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    await act(async () => {
      saveButton?.click();
    });
    await flushEffects();

    const createCall = mockApiFetch.mock.calls.find(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST');
    expect(createCall).toBeTruthy();
    const payload = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>;
    expect(payload.client).toBe('openai');
    expect(payload.accountRef).toBe('codex-sponsor');
    expect(payload.defaultModel).toBe('gpt-5.4-mini');
  });
});

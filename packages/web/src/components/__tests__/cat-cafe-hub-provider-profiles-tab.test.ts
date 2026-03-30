import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';

const storeState = {
  hubState: { open: true, tab: 'provider-profiles' },
  closeHub: () => {},
  threads: [],
  currentThreadId: 'thread-active',
  currentProjectPath: 'default',
  catInvocations: {},
  threadStates: {},
};

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [
      {
        id: 'opus',
        displayName: '布偶猫',
        nickname: '宪宪',
        color: { primary: '#9B7EBD', secondary: '#E8D5F5' },
        mentionPatterns: ['@opus'],
        provider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
        avatar: '/avatars/opus.png',
        roleDescription: '架构',
        personality: '稳重',
      },
    ],
    isLoading: false,
    getCatById: () => undefined,
    getCatsByBreed: () => new Map(),
    refresh: () => Promise.resolve([]),
  }),
  formatCatName: (cat: { displayName: string; variantLabel?: string }) =>
    cat.variantLabel ? `${cat.displayName}（${cat.variantLabel}）` : cat.displayName,
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

import { CatCafeHub } from '@/components/CatCafeHub';
import { HubProviderProfilesTab } from '@/components/HubProviderProfilesTab';

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function providerProfilesResponse(projectPath = '/tmp/project'): Response {
  return jsonResponse({
    projectPath,
    activeProfileId: null,
    bootstrapBindings: {},
    providers: [
      {
        id: 'claude',
        provider: 'claude',
        displayName: 'Claude (OAuth)',
        name: 'Claude (OAuth)',
        authType: 'oauth',
        protocol: 'anthropic',
        kind: 'builtin',
        builtin: true,
        mode: 'subscription',
        models: ['claude-opus-4-6'],
        hasApiKey: false,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
      },
      {
        id: 'openai-proxy',
        provider: 'openai-proxy',
        displayName: 'OpenAI Proxy',
        name: 'OpenAI Proxy',
        authType: 'api_key',
        protocol: 'openai',
        kind: 'api_key',
        builtin: false,
        mode: 'api_key',
        baseUrl: 'https://proxy.example/v1',
        models: ['gpt-4.1', 'gpt-4.1-mini'],
        hasApiKey: true,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
      },
      {
        id: 'agent-teams-local',
        provider: 'agent-teams-local',
        displayName: 'Agent Teams Local',
        name: 'Agent Teams Local',
        authType: 'none',
        protocol: 'acp',
        kind: 'acp',
        builtin: false,
        mode: 'none',
        command: 'agent-teams',
        args: ['gateway', 'acp', 'stdio'],
        cwd: '/opt/workspace/agent-teams',
        boundProviderRef: 'openai-proxy',
        defaultModel: 'gpt-4.1',
        hasApiKey: false,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
      },
    ],
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeField(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
  eventType: 'input' | 'change' = 'input',
) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event(eventType, { bubbles: true }));
  });
}

function queryButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as HTMLButtonElement;
}

describe('CatCafeHub provider profiles tab', () => {
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
    storeState.currentProjectPath = 'default';
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders provider profiles tab label', () => {
    const html = renderToStaticMarkup(React.createElement(CatCafeHub));
    expect(html).toContain('账号配置');
  });

  it('loads only provider profiles for the current project path', async () => {
    storeState.currentProjectPath = '/tmp/f127-worktree';
    const requestedPaths: string[] = [];
    mockApiFetch.mockImplementation((path: string) => {
      requestedPaths.push(path);
      return Promise.resolve(providerProfilesResponse('/tmp/f127-worktree'));
    });

    await act(async () => {
      root.render(React.createElement(HubProviderProfilesTab));
    });
    await flushEffects();

    expect(requestedPaths).toEqual([
      `/api/provider-profiles?projectPath=${encodeURIComponent('/tmp/f127-worktree')}`,
    ]);
  });

  it('removes ACP Model Profiles UI and only shows provider-profile secrets storage', async () => {
    mockApiFetch.mockResolvedValue(providerProfilesResponse());

    await act(async () => {
      root.render(React.createElement(HubProviderProfilesTab));
    });
    await flushEffects();

    expect(container.textContent).not.toContain('ACP Model Profiles');
    expect(container.textContent).not.toContain('新建 ACP Model Profile');
    expect(container.textContent).toContain('.cat-cafe/provider-profiles.secrets.local.json');
    expect(container.textContent).not.toContain('.cat-cafe/acp-model-profiles.secrets.local.json');
  });

  it('creates ACP providers by binding an existing API-key provider and default model', async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = [];
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      requests.push({ path, init });
      if (path.startsWith('/api/provider-profiles') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(providerProfilesResponse('/tmp/project'));
    });

    await act(async () => {
      root.render(React.createElement(HubProviderProfilesTab));
    });
    await flushEffects();

    await act(async () => {
      queryButton(container, '新建 API Key 账号').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const selects = container.querySelectorAll('select');
    const kindSelect = selects[0] as HTMLSelectElement;
    await changeField(kindSelect, 'acp', 'change');

    const displayNameInput = container.querySelector('input[placeholder*="Provider 显示名"]') as HTMLInputElement;
    const commandInput = container.querySelector('input[placeholder="命令，如 uv"]') as HTMLInputElement;
    const argsInput = container.querySelector('textarea[placeholder*="gateway acp stdio"]') as HTMLTextAreaElement;
    const cwdInput = container.querySelector('input[placeholder*="可选 cwd"]') as HTMLInputElement;
    const boundProviderSelect = container.querySelectorAll('select')[1] as HTMLSelectElement;

    await changeField(displayNameInput, 'Agent Teams Local');
    await changeField(commandInput, 'agent-teams');
    await changeField(argsInput, 'gateway acp stdio');
    await changeField(cwdInput, '/opt/workspace/agent-teams');
    await changeField(boundProviderSelect, 'openai-proxy', 'change');

    const defaultModelSelect = container.querySelectorAll('select')[2] as HTMLSelectElement;
    await changeField(defaultModelSelect, 'gpt-4.1', 'change');

    await act(async () => {
      queryButton(container, '创建').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const createRequest = requests.find((entry) => entry.path === '/api/provider-profiles' && entry.init?.method === 'POST');
    expect(createRequest).toBeTruthy();
    expect(JSON.parse(String(createRequest?.init?.body))).toMatchObject({
      projectPath: '/tmp/project',
      kind: 'acp',
      displayName: 'Agent Teams Local',
      command: 'agent-teams',
      args: ['gateway', 'acp', 'stdio'],
      cwd: '/opt/workspace/agent-teams',
      boundProviderRef: 'openai-proxy',
      defaultModel: 'gpt-4.1',
    });
  });
});

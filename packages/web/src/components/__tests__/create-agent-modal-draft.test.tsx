/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import type { CatData } from '@/hooks/useCatData';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const AGENT_NAME_VALIDATION_MESSAGE =
  '支持中文、数字、下划线、中划线和空格，长度 2-64 字符，但不允许以空格开头或结尾';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockModalBootApi() {
  mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/available-clients') {
      return Promise.resolve(
        jsonResponse({
          clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
        }),
      );
    }
    if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
      return Promise.resolve(jsonResponse({ list: [] }));
    }
    throw new Error(`Unexpected apiFetch path: ${url}`);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const DEFAULT_MODEL_ITEM = {
  id: 'model_config:huawei-maas:glm-5',
  name: 'GLM-5',
  provider: 'Huawei MaaS',
  accountRef: 'huawei-maas',
  protocol: 'huawei_maas',
  enabled: true,
};

describe('CreateAgentModal', () => {
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
    localStorage.clear();
    useChatStore.getState().setCurrentProject('/tmp/project');
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

  it('saves Huawei system models from /api/maas-models using accountRef + bare model name', async () => {
    const onSaved = vi.fn();
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/available-clients') {
        return Promise.resolve(
          jsonResponse({
            clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
          }),
        );
      }
      if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'model_config:huawei-maas:glm-5',
                name: 'GLM-5',
                provider: 'Huawei MaaS',
                accountRef: 'huawei-maas',
                protocol: 'huawei_maas',
                enabled: true,
              },
            ],
          }),
        );
      }
      if (url === '/api/cats' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ cat: { id: 'huawei-bot' } }, 201));
      }
      throw new Error(`Unexpected apiFetch path: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Huawei Bot',
          description: 'ACP header bridge',
          onClose: vi.fn(),
          onSaved,
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const postCall = mockApiFetch.mock.calls.find(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.accountRef).toBe('huawei-maas');
    expect(payload.defaultModel).toBe('glm-5');
    expect(onSaved).toHaveBeenCalledWith('huawei-bot');
  });

  it('hides the client selector and saves relayclaw for new agents', async () => {
    const onSaved = vi.fn();
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/available-clients') {
        return Promise.resolve(
          jsonResponse({
            clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
          }),
        );
      }
      if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        return Promise.resolve(jsonResponse({ list: [DEFAULT_MODEL_ITEM] }));
      }
      if (url === '/api/cats' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ cat: { id: 'new-agent' } }, 201));
      }
      throw new Error(`Unexpected apiFetch path: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'New Agent',
          description: 'Create flow',
          onClose: vi.fn(),
          onSaved,
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    expect(container.querySelector('button[aria-label="Client"]')).toBeNull();
    expect(container.textContent).not.toContain('Agent 客户端');

    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const postCall = mockApiFetch.mock.calls.find(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.client).toBe('relayclaw');
    expect(onSaved).toHaveBeenCalledWith('new-agent');
  });

  it('hides the client selector and saves relayclaw for edited agents', async () => {
    const onSaved = vi.fn();
    const cat: CatData = {
      id: 'cat-1',
      name: 'Edited Agent',
      displayName: 'Edited Agent',
      color: { primary: '#111111', secondary: '#222222' },
      mentionPatterns: ['@edited-agent'],
      provider: 'openai',
      accountRef: 'legacy-account',
      defaultModel: 'legacy-model',
      avatar: '/avatars/agent-avatar-1.png',
      roleDescription: 'Existing description',
      personality: '',
      source: 'runtime',
    };

    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/available-clients') {
        return Promise.resolve(
          jsonResponse({
            clients: [{ id: 'relayclaw', label: 'jiuwen', command: 'jiuwenclaw-app', available: true }],
          }),
        );
      }
      if (url === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        return Promise.resolve(jsonResponse({ list: [DEFAULT_MODEL_ITEM] }));
      }
      if (url === '/api/cats/cat-1' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ cat: { id: 'cat-1' } }));
      }
      throw new Error(`Unexpected apiFetch path: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          cat,
          name: 'Edited Agent',
          description: 'Edit flow',
          onClose: vi.fn(),
          onSaved,
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    expect(container.querySelector('button[aria-label="Client"]')).toBeNull();
    expect(container.textContent).not.toContain('Agent 客户端');

    const saveButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const patchCall = mockApiFetch.mock.calls.find(
      ([path, requestInit]) => path === '/api/cats/cat-1' && requestInit?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.client).toBe('relayclaw');
    expect(onSaved).toHaveBeenCalledWith('cat-1');
  });

  it('uses shared footer button classes', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Style Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const cancelButton = container.querySelector('button[aria-label=\"Cancel\"]') as HTMLButtonElement | null;
    const confirmButton = container.querySelector('button[aria-label=\"Create\"]') as HTMLButtonElement | null;

    expect(cancelButton?.className).toContain('ui-button-default');
    expect(cancelButton?.className).not.toContain('ui-button-secondary');
    expect(confirmButton?.className).toContain('ui-button-primary');
  });

  it('shows inline validation and disables confirm when name is empty', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Name Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const nameInput = container.querySelector('input[aria-label="Name"]') as HTMLInputElement | null;
    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(nameInput).toBeTruthy();
    expect(createButton).toBeTruthy();

    await act(async () => {
      setInputValue(nameInput!, '');
    });

    await flushEffects();

    expect(container.textContent).toContain(AGENT_NAME_VALIDATION_MESSAGE);
    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(createButton?.disabled).toBe(true);
    expect(mockApiFetch.mock.calls.some(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST')).toBe(false);
  });

  it('shows inline validation and disables confirm when name has no valid characters', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Name Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const nameInput = container.querySelector('input[aria-label="Name"]') as HTMLInputElement | null;
    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(nameInput).toBeTruthy();
    expect(createButton).toBeTruthy();

    await act(async () => {
      setInputValue(nameInput!, '!!!');
    });

    await flushEffects();

    expect(container.textContent).toContain(AGENT_NAME_VALIDATION_MESSAGE);
    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(createButton?.disabled).toBe(true);
    expect(mockApiFetch.mock.calls.some(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST')).toBe(false);
  });

  it('shows inline validation when name starts or ends with spaces', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Name Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const nameInput = container.querySelector('input[aria-label="Name"]') as HTMLInputElement | null;
    const createButton = container.querySelector('button[aria-label="Create"]') as HTMLButtonElement | null;
    expect(nameInput).toBeTruthy();
    expect(createButton).toBeTruthy();

    await act(async () => {
      setInputValue(nameInput!, ' Name Bot ');
    });

    await flushEffects();

    expect(container.textContent).toContain(AGENT_NAME_VALIDATION_MESSAGE);
    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(createButton?.disabled).toBe(true);
    expect(mockApiFetch.mock.calls.some(([path, requestInit]) => path === '/api/cats' && requestInit?.method === 'POST')).toBe(false);
  });

  it('blocks unsupported avatar formats before upload', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Avatar Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const fileInput = container.querySelector('input[aria-label="Avatar file input"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const invalidFile = new File(['avatar'], 'avatar.webp', { type: 'image/webp' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [invalidFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('仅支持上传 png、jpeg、jpg 格式图片');
    expect(mockApiFetch.mock.calls.some(([path]) => String(path) === '/api/preview/screenshot')).toBe(false);
  });

  it('blocks oversized avatar files before upload', async () => {
    mockModalBootApi();

    await act(async () => {
      root.render(
        React.createElement(CreateAgentModal, {
          open: true,
          name: 'Avatar Bot',
          description: '',
          onClose: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
    });
    await flushEffects();
    await flushEffects();

    const fileInput = container.querySelector('input[aria-label="Avatar file input"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const oversizedFile = new File([new Uint8Array(200 * 1024 + 1)], 'avatar.png', { type: 'image/png' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [oversizedFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('头像大小不能超过 200KB');
    expect(mockApiFetch.mock.calls.some(([path]) => String(path) === '/api/preview/screenshot')).toBe(false);
  });
});

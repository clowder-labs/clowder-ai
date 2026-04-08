import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

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
    expect(cancelButton?.className).toContain('ui-modal-action-button');
    expect(confirmButton?.className).toContain('ui-button-primary');
    expect(confirmButton?.className).toContain('ui-modal-action-button');
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

    expect(container.textContent).toContain('请输入名称');
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

    expect(container.textContent).toContain('名称需包含中文、字母或数字');
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

    expect(container.textContent).toContain('仅支持上传 png、jpeg、gif、jpg 格式图片');
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

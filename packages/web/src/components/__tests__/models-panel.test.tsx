import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';

const storeState = {
  currentProjectPath: '/tmp/project',
  openHub: vi.fn(),
};

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

import { ModelsPanel } from '@/components/ModelsPanel';

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

async function changeField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  eventType: 'input' | 'change' = 'input',
) {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event(eventType, { bubbles: true }));
  });
}

describe('ModelsPanel', () => {
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
    storeState.openHub.mockReset();
    vi.stubGlobal('crypto', {
      randomUUID: () => '12345678-1234-5678-1234-567812345678',
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates a custom model source in model.json from the add-model modal and refreshes the list', async () => {
    let maasFetchCount = 0;
    let createPayload: Record<string, unknown> | null = null;

    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/maas-models?projectPath=%2Ftmp%2Fproject') {
        maasFetchCount += 1;
        if (maasFetchCount === 1) {
          return Promise.resolve(jsonResponse({ projectPath: '/tmp/project', list: [] }));
        }
        return Promise.resolve(
          jsonResponse({
            projectPath: '/tmp/project',
            list: [
              {
                id: 'model_config:my-openai-proxy:gpt-4o-mini',
                object: 'provider',
                name: 'gpt-4o-mini',
                description: '自定义模型源 · My OpenAI Proxy',
              },
            ],
          }),
        );
      }
      if (path === '/api/model-config-profiles' && init?.method === 'POST') {
        createPayload = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            provider: {
              id: 'my-openai-proxy',
              displayName: 'My OpenAI Proxy',
              models: ['gpt-4o-mini'],
            },
          }, 201),
        );
      }
      throw new Error(`Unexpected apiFetch path: ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const openButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '添加模型');
    expect(openButton).toBeTruthy();
    await act(async () => {
      openButton?.click();
    });
    await flushEffects();

    await changeField(
      container.querySelector('input[placeholder*="显示名称"]') as HTMLInputElement,
      'My OpenAI Proxy',
    );
    await changeField(
      container.querySelector('input[placeholder*="Base URL"]') as HTMLInputElement,
      'https://proxy.example.com/v1',
    );
    await changeField(container.querySelector('input[placeholder="API Key"]') as HTMLInputElement, 'sk-proxy');
    await changeField(
      container.querySelector('textarea[placeholder*="可选请求头"]') as HTMLTextAreaElement,
      '{"X-App-Id":"cat-cafe"}',
    );

    const addButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === '+ 添加模型',
    );
    const addModelButton = addButtons[addButtons.length - 1];
    await act(async () => {
      addModelButton?.click();
    });

    await changeField(
      container.querySelector('input[placeholder*="输入模型名"]') as HTMLInputElement,
      'gpt-4o-mini',
    );

    const confirmAddButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '添加',
    );
    await act(async () => {
      confirmAddButton?.click();
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '创建');
    expect(createButton).toBeTruthy();
    await act(async () => {
      createButton?.click();
    });
    await flushEffects();
    await flushEffects();

    expect(createPayload).toEqual({
      projectPath: '/tmp/project',
      sourceId: '12345678',
      displayName: 'My OpenAI Proxy',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-proxy',
      headers: { 'X-App-Id': 'cat-cafe' },
      models: ['gpt-4o-mini'],
    });
    expect(container.textContent).toContain('gpt-4o-mini');
  });
});

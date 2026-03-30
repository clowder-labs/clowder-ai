import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelsPanel } from '@/components/ModelsPanel';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const SEARCH_PLACEHOLDER = '搜索模型、厂商或描述关键词';

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

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('ModelsPanel search', () => {
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
      if (url === '/api/maas-models') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'gpt-5',
                object: 'model',
                name: 'gpt-5',
                description: 'flagship model',
                labels: ['文本生成', 'Function Call'],
                developer: 'OpenAI',
                icon: '/avatars/assistant.svg',
              },
              {
                id: 'deepseek-r1',
                object: 'model',
                name: 'deepseek-r1',
                description: 'reasoning model',
                labels: ['深度思考'],
                developer: 'DeepSeek',
                icon: '/images/deepseek.svg',
              },
            ],
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

  it('renders a search input below the page title', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    expect(container.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`)).not.toBeNull();
  });

  it('renders one Huawei MaaS group and model labels/developer', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    expect(container.textContent).toContain('华为云 MaaS (2)');
    expect(container.textContent).toContain('文本生成');
    expect(container.textContent).toContain('DeepSeek');
  });

  it('filters cards by model name', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, 'gpt');

    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');
  });

  it('filters cards by labels and developer field', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, '深度思考');

    expect(container.textContent).toContain('deepseek-r1');
    expect(container.textContent).not.toContain('gpt-5');

    await changeInputValue(input!, 'openai');
    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');
  });

  it('shows a no-results state and restores the full list when cleared', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await changeInputValue(input!, 'no-match');

    expect(container.textContent).toContain('未找到匹配模型');
    expect(container.textContent).not.toContain('gpt-5');
    expect(container.textContent).not.toContain('deepseek-r1');

    await changeInputValue(input!, '');

    expect(container.textContent).toContain('gpt-5');
    expect(container.textContent).toContain('deepseek-r1');
  });

  it('filters locally without issuing a second request', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const input = container.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/maas-models');

    await changeInputValue(input!, 'deepseek');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('deepseek-r1');
    expect(container.textContent).not.toContain('gpt-5');
  });
});

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubSkillsTab } from '@/components/HubSkillsTab';
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

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('HubSkillsTab empty search state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    vi.useFakeTimers();
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    vi.useRealTimers();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'Alpha skill',
                tags: ['AI 智能'],
                repo: { githubOwner: 'demo', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  it('shows the shared empty search state and clears filters back to browse results', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('skill-1');

    await changeInputValue(searchInput!, 'zzz');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await flushEffects();

    const emptyShell = container.querySelector('[data-testid="hub-skills-empty-state-shell"]') as HTMLDivElement | null;
    expect(emptyShell).not.toBeNull();
    expect(emptyShell?.className).toContain('h-full');
    expect(emptyShell?.className).toContain('items-center');
    expect(emptyShell?.className).toContain('justify-center');
    expect(container.textContent).toContain('暂未匹配到数据');
    expect(container.textContent).toContain('没有匹配到符合条件的数据');

    const clearButton = container.querySelector('[data-testid="no-search-results-clear"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect((container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null)?.value).toBe('');
    expect(container.textContent).toContain('skill-1');
  });
});

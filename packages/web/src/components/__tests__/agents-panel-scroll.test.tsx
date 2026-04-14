/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.fn(async () => []);

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [
      {
        id: 'runtime-codex',
        name: 'runtime-codex',
        displayName: '办公智能体',
        color: { primary: '#16a34a', secondary: '#bbf7d0' },
        mentionPatterns: ['@runtime-codex'],
        provider: 'openai',
        defaultModel: 'gpt-5.4',
        avatar: '',
        roleDescription: '智能体配置编辑',
        personality: Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 行灵魂配置`).join('\n'),
        teamStrengths: '',
        source: 'runtime',
      },
      {
        id: 'seed-codex',
        name: 'seed-codex',
        displayName: '预置办公智能体',
        color: { primary: '#2563eb', secondary: '#bfdbfe' },
        mentionPatterns: ['@seed-codex'],
        provider: 'openai',
        defaultModel: 'gpt-5.4',
        avatar: '',
        roleDescription: '预置智能体',
        personality: '只读灵魂配置',
        teamStrengths: '',
        source: 'seed',
      },
    ],
    refresh: mockRefresh,
  }),
}));

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://example.test',
  apiFetch: vi.fn(),
}));

vi.mock('@/components/CreateAgentModal', () => ({
  CreateAgentModal: () => null,
}));

vi.mock('@/components/ConnectThirdPartyAgentModal', () => ({
  ConnectThirdPartyAgentModal: () => null,
}));

vi.mock('@/components/PromptSelectionModal', () => ({
  PromptSelectionModal: () => null,
}));

import { AgentsPanel } from '@/components/AgentsPanel';

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`Missing button containing text: ${text}`);
  }
  return button as HTMLButtonElement;
}

describe('AgentsPanel scroll behavior', () => {
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
    mockRefresh.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('auto-grows the persona textarea so scrolling stays on the outer detail panel', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const editButton = findButtonByText(container, '编辑');

    await act(async () => {
      editButton.click();
    });

    const textarea = container.querySelector('[data-testid="agent-tab-textarea"]') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    const editorSurface = textarea?.parentElement as HTMLDivElement | null;
    expect(editorSurface).not.toBeNull();

    Object.defineProperty(editorSurface, 'clientHeight', {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 960,
    });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(textarea?.style.height).toBe('960px');
    expect(textarea?.style.overflowY).toBe('hidden');
  });

  it('renders the 灵魂配置 tab as disabled without selected styling', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const personaTab = container.querySelector('[data-testid="agent-tab-persona"]') as HTMLButtonElement | null;
    expect(personaTab).not.toBeNull();
    expect(personaTab?.disabled).toBe(true);
    expect(personaTab?.className).not.toContain('bg-[rgba(230,230,230,1)]');
  });

  it('hides edit actions for preset agents', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const seedCard = container.querySelector(
      '[data-testid="agent-card-seed-codex"] button',
    ) as HTMLButtonElement | null;
    expect(seedCard).not.toBeNull();

    await act(async () => {
      seedCard?.click();
    });

    const detailHeader = Array.from(container.querySelectorAll('h2')).find((node) =>
      node.textContent?.includes('灵魂配置'),
    )?.parentElement as HTMLElement | null;
    expect(detailHeader).not.toBeNull();
    expect(
      Array.from(detailHeader?.querySelectorAll('button') ?? []).some((button) => button.textContent?.includes('编辑')),
    ).toBe(false);

    const menuButton = container.querySelector(
      '[data-testid="agent-card-menu-seed-codex"]',
    ) as HTMLButtonElement | null;
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.click();
    });

    expect(container.querySelector('[data-testid="agent-edit-menu-item"]')).not.toBeNull();
  });

  it('closes the delete confirm modal when Escape key is pressed', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const seedCard = container.querySelector(
      '[data-testid="agent-card-seed-codex"] button',
    ) as HTMLButtonElement | null;
    expect(seedCard).not.toBeNull();

    await act(async () => {
      seedCard?.click();
    });

    const menuButton = container.querySelector(
      '[data-testid="agent-card-menu-seed-codex"]',
    ) as HTMLButtonElement | null;
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.click();
    });

    const deleteMenuItem = container.querySelector(
      '[data-testid="agent-delete-menu-item"]',
    ) as HTMLButtonElement | null;
    expect(deleteMenuItem).not.toBeNull();

    await act(async () => {
      deleteMenuItem?.click();
    });

    const deleteConfirmModal = container.querySelector('h3.text-\\[16px\\].font-bold:text-gray-900');
    expect(deleteConfirmModal).not.toBeNull();
    expect(deleteConfirmModal?.textContent).toContain('确认删除智能体');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    const deleteConfirmModalAfter = container.querySelector('h3.text-\\[16px\\].font-bold:text-gray-900');
    expect(deleteConfirmModalAfter).toBeNull();
  });
});

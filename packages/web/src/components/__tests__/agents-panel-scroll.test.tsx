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
        id: 'runtime-empty',
        name: 'runtime-empty',
        displayName: '空白办公智能体',
        color: { primary: '#9333ea', secondary: '#e9d5ff' },
        mentionPatterns: ['@runtime-empty'],
        provider: 'openai',
        defaultModel: 'gpt-5.4',
        avatar: '',
        roleDescription: '空白灵魂配置',
        personality: '',
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

function hasClassToken(node: Element | null | undefined, className: string): boolean {
  if (!node) return false;
  return node.className.split(/\s+/).includes(className);
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

  it('keeps empty persona templates in normal flow with bottom breathing room', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const emptyCard = container.querySelector(
      '[data-testid="agent-card-runtime-empty"] button',
    ) as HTMLButtonElement | null;
    expect(emptyCard).not.toBeNull();

    await act(async () => {
      emptyCard?.click();
    });

    const editButton = findButtonByText(container, '编辑');
    await act(async () => {
      editButton.click();
    });

    const templateLabel = Array.from(container.querySelectorAll('span')).find((node) =>
      node.textContent?.includes('灵魂模板'),
    ) as HTMLSpanElement | undefined;
    expect(templateLabel).toBeDefined();

    const templateHeaderRow = templateLabel?.parentElement as HTMLElement | null;
    const templateContent = templateHeaderRow?.parentElement as HTMLElement | null;
    const templateSection = templateContent?.parentElement as HTMLElement | null;
    const editorRoot = container.querySelector('[data-testid="agent-tab-empty-editor"]') as HTMLElement | null;

    expect(hasClassToken(templateSection, 'mt-5')).toBe(true);
    expect(hasClassToken(templateSection, 'overflow-hidden')).toBe(false);
    expect(hasClassToken(editorRoot, 'min-h-full')).toBe(true);
    expect(hasClassToken(editorRoot, 'pb-6')).toBe(true);
    expect(hasClassToken(editorRoot, 'h-full')).toBe(false);
  });

  it('applies the same bottom breathing room to filled preview and editor states', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const previewRoot = container.querySelector('[data-testid="agent-tab-preview"]') as HTMLElement | null;
    expect(previewRoot).not.toBeNull();
    expect(hasClassToken(previewRoot, 'min-h-full')).toBe(true);
    expect(hasClassToken(previewRoot, 'pb-6')).toBe(true);
    expect(hasClassToken(previewRoot, 'h-full')).toBe(false);

    const editButton = findButtonByText(container, '编辑');
    await act(async () => {
      editButton.click();
    });

    const editorRoot = container.querySelector('[data-testid="agent-tab-editor"]') as HTMLElement | null;
    expect(editorRoot).not.toBeNull();
    expect(hasClassToken(editorRoot, 'min-h-full')).toBe(true);
    expect(hasClassToken(editorRoot, 'pb-6')).toBe(true);
    expect(hasClassToken(editorRoot, 'h-full')).toBe(false);
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

  it('uses token-backed selected and hover-ready surfaces for agent cards and action menus', async () => {
    await act(async () => {
      root.render(React.createElement(AgentsPanel));
    });

    const selectedCard = container.querySelector('[data-testid="agent-card-runtime-codex"]') as HTMLDivElement | null;
    expect(selectedCard).not.toBeNull();
    expect(selectedCard?.className).toContain('border-[var(--connector-tab-border-selected)]');
    expect(selectedCard?.className).toContain('bg-[var(--connector-tab-bg-selected)]');

    const unselectedCard = container.querySelector('[data-testid="agent-card-runtime-empty"]') as HTMLDivElement | null;
    expect(unselectedCard).not.toBeNull();
    expect(unselectedCard?.className).toContain('hover:border-[var(--connector-tab-border-hover)]');
    expect(unselectedCard?.className).toContain('hover:bg-[var(--connector-tab-bg-hover)]');

    const menuButton = container.querySelector(
      '[data-testid="agent-card-menu-runtime-codex"]',
    ) as HTMLButtonElement | null;
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.click();
    });

    expect(menuButton?.className).toContain('bg-[var(--overlay-item-hover-bg)]');
    expect(menuButton?.className).toContain('text-[var(--text-accent)]');

    const actionMenu = container.querySelector('[role="menu"]') as HTMLDivElement | null;
    expect(actionMenu).not.toBeNull();
    expect(actionMenu?.className).toContain('ui-overlay-card');
    expect(actionMenu?.className).toContain('shadow-[var(--overlay-shadow)]');
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

    const deleteConfirmModal = Array.from(container.querySelectorAll('h3')).find((node) =>
      node.textContent?.includes('确认删除智能体'),
    );
    expect(deleteConfirmModal).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    const deleteConfirmModalAfter = Array.from(container.querySelectorAll('h3')).find((node) =>
      node.textContent?.includes('确认删除智能体'),
    );
    expect(deleteConfirmModalAfter).toBeUndefined();
  });
});

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubConnectorConfigTab } from '@/components/HubConnectorConfigTab';
import {
  HubCoCreatorOverviewCard,
  HubMemberOverviewCard,
  HubOverviewToolbar,
} from '@/components/HubMemberOverviewCard';
import { HubSkillsTab } from '@/components/HubSkillsTab';
import type { CatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/UploadSkillModal', () => ({ UploadSkillModal: () => null }));
vi.mock('@/components/WeixinQrPanel', () => ({
  WeixinQrPanel: () => React.createElement('div', { 'data-testid': 'weixin-qr' }),
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

const sampleCat = {
  id: 'office',
  displayName: 'Office',
  breedDisplayName: 'Office',
  nickname: 'Ops',
  provider: 'openai',
  defaultModel: 'gpt-5',
  mentionPatterns: ['@office', '@ops'],
  source: 'config',
  roster: { available: true },
} as unknown as CatData;

describe('business theme secondary surfaces', () => {
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
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all') || url.startsWith('/api/skills?')) {
        const parsed = new URL(url, 'https://example.test');
        const category = parsed.searchParams.get('category');
        const skills =
          category === 'developer-tools'
            ? [
                {
                  id: 'skill-1',
                  slug: 'skill-1',
                  name: 'skill-1',
                  description: 'search helper',
                  tags: ['developer-tools'],
                  repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                  isInstalled: false,
                },
              ]
            : category === 'ai-intelligence'
              ? [
                  {
                    id: 'alpha-helper',
                    slug: 'alpha-helper',
                    name: 'alpha-helper',
                    description: 'alpha helper',
                    tags: ['ai-intelligence'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ]
              : [
                  {
                    id: 'skill-1',
                    slug: 'skill-1',
                    name: 'skill-1',
                    description: 'search helper',
                    tags: ['developer-tools'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                  {
                    id: 'alpha-helper',
                    slug: 'alpha-helper',
                    name: 'alpha-helper',
                    description: 'alpha helper',
                    tags: ['ai-intelligence'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ];
        return Promise.resolve(
          jsonResponse({
            skills,
            total: skills.length,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'slack',
                name: 'Slack',
                nameEn: 'Slack',
                configured: false,
                docsUrl: 'https://example.com/docs',
                steps: ['Open app settings', 'Save credentials'],
                fields: [{ envName: 'SLACK_TOKEN', label: 'Token', sensitive: false, currentValue: null }],
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

  it('renders member surfaces with shared card and button tokens', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          'div',
          null,
          React.createElement(HubOverviewToolbar, { onAddMember: vi.fn() }),
          React.createElement(HubCoCreatorOverviewCard, {
            coCreator: {
              name: 'ME',
              aliases: ['me'],
              mentionPatterns: ['@me'],
              color: { primary: '#D4A76A', secondary: '#FFF8F0' },
              avatar: undefined,
            },
            onEdit: vi.fn(),
          }),
          React.createElement(HubMemberOverviewCard, {
            cat: sampleCat,
            onEdit: vi.fn(),
            onToggleAvailability: vi.fn(),
          }),
        ),
      );
    });

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('添加成员'),
    );
    expect(button?.className).toContain('ui-button-primary');
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections.some((section) => section.className.includes('ui-card-muted'))).toBe(true);
    expect(sections.some((section) => section.className.includes('ui-card'))).toBe(true);
    expect(sections.some((section) => section.className.includes('ui-card-hover'))).toBe(true);
  });

  it('renders HubSkillsTab with tokenized cards, fields, and actions', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushEffects();
    await flushEffects();

    expect(container.querySelector('input')?.className).toContain('ui-input');
    const plazaHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(2)'),
    );
    const searchInput = container.querySelector('input[aria-label="搜索技能"]');
    const firstSkillCard = container.querySelector('article');
    expect(
      Boolean(
        plazaHeading &&
          searchInput &&
          firstSkillCard &&
          (plazaHeading.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (searchInput.compareDocumentPosition(firstSkillCard) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ),
    ).toBe(true);
    expect(firstSkillCard?.className).toContain('ui-card');
    expect(firstSkillCard?.className).toContain('ui-card-hover');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.textContent?.includes('安装'))).toBe(true);
    expect(buttons.some((button) => button.textContent?.includes('导入'))).toBe(false);
  });

  it('uses the shared custom tooltip for plaza skill descriptions', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const descriptionNode = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('search helper'),
    );
    expect(descriptionNode).not.toBeNull();
    expect(descriptionNode?.getAttribute('title')).toBeNull();

    await act(async () => {
      descriptionNode?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('search helper');
  });

  it('filters in-memory skill list and does not call search endpoint', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'alpha');
    await flushEffects();

    expect(container.textContent).toContain('alpha-helper');
    expect(container.textContent).not.toContain('skill-1');

    const calledSearchEndpoint = mockApiFetch.mock.calls.some(([input]) =>
      String(input).startsWith('/api/skills/search'),
    );
    expect(calledSearchEndpoint).toBe(false);
  });

  it('uses the remote plaza search endpoint when pressing Enter in the search box', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'alpha');

    mockApiFetch.mockClear();
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search')) {
        const parsed = new URL(url, 'https://example.test');
        expect(parsed.searchParams.get('q')).toBe('alpha');
        expect(parsed.searchParams.get('page')).toBe('1');
        expect(parsed.searchParams.get('limit')).toBe('24');
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-helper',
                slug: 'alpha-helper',
                name: 'alpha-helper',
                description: 'alpha helper',
                tags: ['ai-intelligence'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      searchInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();
    await flushEffects();

    expect(container.textContent).toContain('alpha-helper');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/search?q=alpha&page=1&limit=24');
  });

  it('uses the active category name as the plaza title', async () => {
    await act(async () => {
      root.render(React.createElement(HubSkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const initialHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(2)'),
    );
    expect(initialHeading?.textContent).toContain('全部 (2)');

    const developerTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('开发工具'),
    );
    expect(developerTab).not.toBeUndefined();

    await act(async () => {
      developerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    await flushEffects();

    const updatedHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(1)'),
    );
    expect(updatedHeading?.textContent).toContain('开发工具 (1)');
    expect(updatedHeading?.textContent).not.toContain('技能广场');
  });

  it('renders HubConnectorConfigTab with tokenized cards and form controls', async () => {
    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const leftPane = container.querySelector('[data-testid="connector-left-pane"]');
    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();

    const slackItem = container.querySelector('[data-testid="platform-item-slack"]');
    expect(slackItem?.className).toContain('[border-radius:var(--connector-tab-radius)]');
    await act(async () => {
      slackItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('input')?.className).toContain('ui-input');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.className.includes('ui-button-primary'))).toBe(true);
    expect(buttons.some((button) => button.className.includes('ui-button-default'))).toBe(true);
  });
});

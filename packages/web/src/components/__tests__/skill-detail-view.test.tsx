import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillDetailView } from '@/components/SkillDetailView';
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

describe('SkillDetailView', () => {
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
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/detail?name=demo-skill') {
        return Promise.resolve(
          jsonResponse({
            id: 'demo-skill',
            name: 'demo-skill',
            description: 'Skill detail description',
            category: 'Automation',
            source: 'cat-cafe',
            enabled: true,
            triggers: ['demo', 'detail'],
            mounts: { claude: true, codex: false, gemini: true },
            cats: { office: true, review: false },
            fileTree: [
              {
                name: 'SKILL.md',
                path: 'SKILL.md',
                type: 'file',
                size: 128,
              },
              {
                name: 'README.md',
                path: 'README.md',
                type: 'file',
                size: 256,
              },
            ],
          }),
        );
      }
      if (url === '/api/skills/file?name=demo-skill&path=SKILL.md') {
        return Promise.resolve(
          jsonResponse({
            path: 'SKILL.md',
            content: '# Skill File\n\nSkill file preview content',
            size: 128,
            mime: 'text/markdown',
            truncated: false,
          }),
        );
      }
      if (url === '/api/skills/file?name=demo-skill&path=README.md') {
        return Promise.resolve(
          jsonResponse({
            path: 'README.md',
            content: 'README preview content',
            size: 256,
            mime: 'text/markdown',
            truncated: false,
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

  it('loads the first file preview and renders the five-field basic info layout', async () => {
    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          avatarUrl: '/avatars/demo-skill.png',
          onBack: vi.fn(),
        }),
      );
    });
    await flushEffects();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/detail?name=demo-skill', { signal: expect.any(AbortSignal) });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/file?name=demo-skill&path=SKILL.md', {
      signal: expect.any(AbortSignal),
    });
    expect(container.textContent).toContain('demo-skill');
    expect(container.textContent).toContain('SKILL.md');
    expect(container.querySelector('[data-testid="skill-detail-avatar"]')).not.toBeNull();
    expect(container.querySelector('img[alt="demo-skill avatar"]')?.getAttribute('src')).toBe('/avatars/demo-skill.png');
    expect(container.querySelector('[data-testid="skill-detail-category-badge"]')?.textContent).toBe('Automation');
    expect(container.querySelector('[data-testid="skill-detail-description-card"]')).toBeNull();

    const basicInfo = container.querySelector('[data-testid="skill-detail-basic-info"]');
    const basicInfoText = basicInfo?.textContent ?? '';
    const basicInfoGrids = basicInfo?.querySelectorAll(':scope > div') ?? [];
    const basicInfoFields = basicInfo?.querySelectorAll('.space-y-2') ?? [];

    expect(basicInfoText).toContain('Skill detail description');
    expect(basicInfoGrids).toHaveLength(2);
    expect(basicInfoGrids[0]?.className).toContain('md:grid-cols-3');
    expect(basicInfoGrids[1]?.className).toContain('md:grid-cols-3');
    expect(basicInfoFields).toHaveLength(5);

    expect(container.querySelector('[data-testid="skill-detail-file-workspace"]')?.textContent).toContain('SKILL.md');
    expect(container.querySelector('[data-testid="skill-detail-file-preview"]')?.textContent).toContain(
      'Skill file preview content',
    );

    const updateButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === '更新',
    );
    expect(updateButton).toBeUndefined();
  });

  it('truncates the description to two lines and shows the full text in an overflow tooltip', async () => {
    const description = '这是一段很长的技能详情描述，用来验证基础信息里的描述字段会两行省略，并在悬停后通过公共 tooltip 展示完整内容。';

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/detail?name=demo-skill') {
        return Promise.resolve(
          jsonResponse({
            id: 'demo-skill',
            name: 'demo-skill',
            description,
            category: 'Automation',
            source: 'cat-cafe',
            enabled: true,
            triggers: ['demo', 'detail'],
            mounts: { claude: true, codex: false, gemini: true },
            cats: { office: true, review: false },
            fileTree: [
              {
                name: 'SKILL.md',
                path: 'SKILL.md',
                type: 'file',
                size: 128,
              },
            ],
          }),
        );
      }
      if (url === '/api/skills/file?name=demo-skill&path=SKILL.md') {
        return Promise.resolve(
          jsonResponse({
            path: 'SKILL.md',
            content: '# Skill File\n\nSkill file preview content',
            size: 128,
            mime: 'text/markdown',
            truncated: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          avatarUrl: '/avatars/demo-skill.png',
          onBack: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const descriptionNode = Array.from(
      container.querySelectorAll('[data-testid="skill-detail-basic-info"] p'),
    ).find((node) => node.textContent === description);
    expect(descriptionNode).not.toBeNull();
    expect(descriptionNode?.className).toContain('line-clamp-2');
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    if (!descriptionNode) return;

    Object.defineProperty(descriptionNode, 'clientWidth', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(descriptionNode, 'scrollWidth', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(descriptionNode, 'clientHeight', {
      configurable: true,
      value: 48,
    });
    Object.defineProperty(descriptionNode, 'scrollHeight', {
      configurable: true,
      value: 96,
    });

    await act(async () => {
      descriptionNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(description);
  });

  it('keeps the file workspace constrained to the remaining height and scrolls internally', async () => {
    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          avatarUrl: '/avatars/demo-skill.png',
          onBack: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const scroller = container.querySelector('[data-testid="skill-detail-panel"] > .min-h-0.flex-1');
    expect(scroller?.className).toContain('overflow-hidden');
    expect(scroller?.className).not.toContain('overflow-y-auto');

    const contentColumn = container.querySelector('[data-testid="skill-detail-panel"] > .min-h-0.flex-1 > div');
    expect(contentColumn?.className).toContain('h-full');
    expect(contentColumn?.className).not.toContain('min-h-full');

    const workspace = container.querySelector('[data-testid="skill-detail-file-workspace"]');
    expect(workspace?.className).toContain('flex-1');
    expect(workspace?.className).toContain('min-h-0');

    const panes = workspace?.querySelectorAll('.overflow-y-auto');
    expect(panes?.length).toBeGreaterThanOrEqual(2);
  });

  it('requests file preview when clicking another file in the tree', async () => {
    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          avatarUrl: '/avatars/demo-skill.png',
          onBack: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const readmeButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes('README.md'),
    );
    expect(readmeButton).not.toBeUndefined();

    await act(async () => {
      readmeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/file?name=demo-skill&path=README.md', {
      signal: expect.any(AbortSignal),
    });
    expect(container.querySelector('[data-testid="skill-detail-file-preview"]')?.textContent).toContain(
      'README preview content',
    );
  });

  it('shows the centered loading state while file preview content is loading', async () => {
    let resolvePreview: ((value: Response) => void) | null = null;

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/detail?name=demo-skill') {
        return Promise.resolve(
          jsonResponse({
            id: 'demo-skill',
            name: 'demo-skill',
            description: 'Skill detail description',
            category: 'Automation',
            source: 'cat-cafe',
            enabled: true,
            triggers: ['demo', 'detail'],
            mounts: { claude: true, codex: false, gemini: true },
            cats: { office: true, review: false },
            fileTree: [
              {
                name: 'SKILL.md',
                path: 'SKILL.md',
                type: 'file',
                size: 128,
              },
            ],
          }),
        );
      }
      if (url === '/api/skills/file?name=demo-skill&path=SKILL.md') {
        return new Promise<Response>((resolve) => {
          resolvePreview = resolve;
        });
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          avatarUrl: '/avatars/demo-skill.png',
          onBack: vi.fn(),
        }),
      );
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="skill-detail-file-workspace"] [data-testid="skills-loading-state"]')).not.toBeNull();

    await act(async () => {
      resolvePreview?.(
        jsonResponse({
          path: 'SKILL.md',
          content: '# Skill File\n\nSkill file preview content',
          size: 128,
          mime: 'text/markdown',
          truncated: false,
        }),
      );
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="skill-detail-file-workspace"] [data-testid="skills-loading-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="skill-detail-file-preview"]')?.textContent).toContain(
      'Skill file preview content',
    );
  });

  it('navigates back when clicking the breadcrumb', async () => {
    const onBack = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(SkillDetailView, {
          skillName: 'demo-skill',
          onBack,
        }),
      );
    });
    await flushEffects();

    const breadcrumbButton = container.querySelector('[data-testid="skill-detail-breadcrumb-back"]');
    expect(breadcrumbButton).not.toBeNull();

    act(() => {
      (breadcrumbButton as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

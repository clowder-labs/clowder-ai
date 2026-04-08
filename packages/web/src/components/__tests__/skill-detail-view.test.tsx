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

  it('loads the first file preview and renders it in the workspace panel', async () => {
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
    expect(container.textContent).toContain('我的技能');
    expect(container.textContent).toContain('demo-skill');
    expect(container.textContent).toContain('基础信息');
    expect(container.textContent).toContain('文件目录');
    expect(container.textContent).toContain('名称');
    expect(container.textContent).toContain('更新时间');
    expect(container.textContent).toContain('描述');
    expect(container.textContent).toContain('demo');
    expect(container.textContent).toContain('SKILL.md');
    expect(container.querySelector('[data-testid="skill-detail-avatar"]')).not.toBeNull();
    expect(container.querySelector('img[alt="demo-skill avatar"]')?.getAttribute('src')).toBe('/avatars/demo-skill.png');
    expect(container.querySelector('[data-testid="skill-detail-category-badge"]')?.textContent).toBe('Automation');
    expect(container.querySelector('[data-testid="skill-detail-description-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="skill-detail-basic-info"]')?.textContent).toContain(
      'Skill detail description',
    );
    expect(container.querySelector('[data-testid="skill-detail-file-workspace"]')?.textContent).toContain('SKILL.md');
    expect(container.querySelector('[data-testid="skill-detail-file-preview"]')?.textContent).toContain(
      'Skill file preview content',
    );
    const updateButton = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === '更新',
    );
    expect(updateButton).toBeUndefined();
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

  it('navigates back when clicking the 我的技能 breadcrumb', async () => {
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

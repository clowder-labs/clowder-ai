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
            ],
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

  it('requests /api/skills/detail and renders detail content', async () => {
    await act(async () => {
      root.render(React.createElement(SkillDetailView, { skillName: 'demo-skill', onBack: vi.fn() }));
    });
    await flushEffects();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/detail?name=demo-skill', { signal: expect.any(AbortSignal) });
    expect(container.textContent).toContain('我的技能');
    expect(container.textContent).toContain('demo-skill');
    expect(container.textContent).toContain('Skill detail description');
    expect(container.textContent).toContain('Automation');
    expect(container.textContent).toContain('demo');
    expect(container.textContent).toContain('SKILL.md');
  });

  it('navigates back when clicking the 我的技能 breadcrumb', async () => {
    const onBack = vi.fn();

    await act(async () => {
      root.render(React.createElement(SkillDetailView, { skillName: 'demo-skill', onBack }));
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

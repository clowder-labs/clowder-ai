/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F097: CliOutputBlock — collapsed/expanded rendering, terminal substrate, visibility chip
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliEvent } from '@/stores/chat-types';
import type { AuthPendingRequest } from '@/hooks/useAuthorization';
import { apiFetch } from '@/utils/api-client';

// Stub MarkdownContent (heavy dep)
vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('div', { 'data-testid': 'md' }, content),
}));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

const { CliOutputBlock } = await import('../cli-output/CliOutputBlock');
const mockApiFetch = vi.mocked(apiFetch);

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
  mockApiFetch.mockClear();
  mockApiFetch.mockImplementation(async (path) => {
    if (path === '/api/projects/cwd') {
      return {
        ok: true,
        json: async () => ({ path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent' }),
      } as Response;
    }
    if (path === '/api/workspace/local-file-meta') {
      return {
        ok: true,
        json: async () => ({ generatedAt: Date.parse('2026-03-24T08:00:00.000Z') }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const doneEvents: CliEvent[] = [
  { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read index.ts' },
  { id: 't2', kind: 'tool_result', timestamp: 1001, label: 'Read index.ts', detail: '200 lines' },
  { id: 't3', kind: 'text', timestamp: 1002, content: 'Looks good.' },
];

const authRequest: AuthPendingRequest = {
  requestId: 'auth-1',
  catId: 'codex',
  threadId: 'thread-1',
  action: 'shell_command',
  reason: 'Need approval\nRun outside sandbox',
  createdAt: 1003,
};

describe('CliOutputBlock', () => {
  it('renders completed tool-call summary when collapsed (default)', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    const text = container.textContent ?? '';
    expect(text).toContain('已执行1次工具调用');
    expect(text).not.toContain('正在执行工具调用');
  });

  it('shows expanded content when defaultExpanded=true', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // CLI block expanded, stdout visible; tools collapsed by default when done
    expect(container.textContent).toContain('Looks good.');
    expect(container.textContent).toContain('已执行1次工具调用');
    // Expand tools section to see tool labels
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    expect(container.textContent).toContain('Read index.ts');
  });

  it('renders authorization cards inline beneath the tools section', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
          authorizationRequests: [authRequest],
          onAuthorizationRespond: vi.fn(),
        }),
      );
    });

    const authCard = container.querySelector('[data-testid="authorization-card"]');
    expect(authCard).toBeTruthy();
    expect(authCard?.textContent).toContain('Need approval');
    expect(authCard?.textContent).toContain('Run outside sandbox');

    const cliBody = container.querySelector('[data-testid="cli-output-body"]');
    expect(cliBody?.contains(authCard as Node)).toBe(true);
  });

  it('keeps markdown output in a block wrapper with bottom padding', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    const markdownWrapper = container.querySelector('[data-testid="cli-output-markdown"]') as HTMLDivElement | null;
    expect(markdownWrapper).toBeTruthy();
    expect(markdownWrapper?.className).toContain('pb-2');

    const markdownHost = markdownWrapper?.firstElementChild as HTMLDivElement | null;
    expect(markdownHost?.tagName).toBe('DIV');
    expect(markdownHost?.querySelector('[data-testid="md"]')?.textContent).toBe('Looks good.');
  });

  it('streaming status → always expanded, summary says tool call is running', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [{ id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash pnpm test' }],
          status: 'streaming',
        }),
      );
    });
    const text = container.textContent ?? '';
    expect(text).toContain('正在执行工具调用');
    expect(text).toContain('Bash pnpm test');
  });

  it('shows shared visibility chip when thinkingMode=debug', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          thinkingMode: 'debug',
        }),
      );
    });
    expect(container.textContent).toContain('shared');
  });

  it('shows private label when thinkingMode=play', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          thinkingMode: 'play',
        }),
      );
    });
    expect(container.textContent).toContain('private');
  });

  it('returns null when no events', () => {
    act(() => {
      root.render(
        React.createElement(
          'div',
          { id: 'wrapper' },
          React.createElement(CliOutputBlock, { events: [], status: 'done' }),
        ),
      );
    });
    const wrapper = container.querySelector('#wrapper');
    expect(wrapper?.children.length).toBe(0);
  });

  it('can transition from empty events to populated events without hook-order errors', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [],
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toBe('');

    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toContain('已执行1次工具调用');
  });

  it('has dark terminal substrate class', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Look for the dark bg container
    const darkEl = container.querySelector('[data-testid="cli-output-body"]');
    expect(darkEl).toBeTruthy();
  });

  it('clicking summary toggles expansion', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    // Initially collapsed — tool stdout is visible, detail body is collapsed
    expect(container.textContent).toContain('Looks good.');

    // Click to expand
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    act(() => {
      button?.click();
    });
    expect(container.textContent).toContain('Looks good.');

    // Click to collapse
    act(() => {
      button?.click();
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeFalsy();
  });

  it('shows completed tool count even after failure', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [{ id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash deploy' }],
          status: 'failed',
        }),
      );
    });
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  // ── P1-1: per-tool collapse (AC-A2) ──
  it('tool rows are individually collapsible — click to show detail', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read index.ts' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read index.ts', detail: '200 lines read' },
          ],
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Tools section collapsed by default when done — expand it first
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    // Tool label visible, but detail hidden by default (collapsed row)
    expect(container.textContent).toContain('Read index.ts');
    expect(container.textContent).not.toContain('200 lines read');

    // Click the tool row to expand it
    const toolRow = container.querySelector('[data-testid="tool-row-t1"]') as HTMLElement | null;
    expect(toolRow).toBeTruthy();
    act(() => {
      toolRow?.click();
    });
    expect(container.textContent).toContain('200 lines read');
    const detailPanel = toolRow?.querySelector('.break-words') as HTMLDivElement | null;
    expect(detailPanel?.className).toContain('break-words');
    expect(detailPanel?.className).toContain('[overflow-wrap:anywhere]');
  });

  // ── P1-2: auto-collapse on streaming→done (AC-A6) ──
  it('auto-collapses when status changes from streaming to done (no user interaction)', () => {
    // Start streaming → expanded
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'streaming',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();

    // Status changes to done → should auto-collapse
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeFalsy();
  });

  it('does NOT auto-collapse if user manually expanded', () => {
    // Start collapsed (done)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    // User clicks to expand
    const btn = container.querySelector('button');
    act(() => {
      btn?.click();
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();

    // Re-render with same status — should stay expanded (user interacted)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();
  });

  // ── P1-3: duplicate label matching ──
  it('correctly matches tool_result for duplicate tool labels', () => {
    const dupeEvents: CliEvent[] = [
      { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Bash pnpm test' },
      { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Bash pnpm test', detail: 'FAIL 3 tests' },
      { id: 'u2', kind: 'tool_use', timestamp: 1002, label: 'Bash pnpm test' },
      { id: 'r2', kind: 'tool_result', timestamp: 1003, label: 'Bash pnpm test', detail: 'PASS all' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: dupeEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    // Expand tools section first (collapsed by default when done)
    const toolsToggle = container.querySelector('[data-testid="tools-section-toggle"]') as HTMLElement | null;
    act(() => {
      toolsToggle?.click();
    });
    // Expand both tool rows to see details
    const row1 = container.querySelector('[data-testid="tool-row-u1"]') as HTMLElement | null;
    const row2 = container.querySelector('[data-testid="tool-row-u2"]') as HTMLElement | null;
    act(() => {
      row1?.click();
      row2?.click();
    });
    const text = container.textContent ?? '';
    // First tool should show FAIL, second should show PASS
    expect(text).toContain('FAIL 3 tests');
    expect(text).toContain('PASS all');
  });

  // ── Cloud P1: tool-row click counts as user interaction ──
  it('falls back to index-based match when tool_use has toolCallId but tool_result lacks it', () => {
    const fallbackEvents: CliEvent[] = [
      { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Read foo.ts', toolCallId: 'call-1' },
      { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read foo.ts', detail: 'ok (legacy result)' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: fallbackEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });

    const row = container.querySelector('[data-testid="tool-row-u1"]');
    expect(row?.querySelector('.animate-spin')).toBeFalsy();
  });

  it('does not show loading spinner for unmatched tool_use after stream finished', () => {
    const unmatchedDoneEvents: CliEvent[] = [{ id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Bash pnpm test' }];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: unmatchedDoneEvents,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });

    const row = container.querySelector('[data-testid="tool-row-u1"]');
    expect(row?.querySelector('.animate-spin')).toBeFalsy();
  });

  it('does NOT auto-collapse if user expanded a tool row', () => {
    // Start streaming
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read', detail: '200 lines' },
          ],
          status: 'streaming',
          defaultExpanded: true,
        }),
      );
    });
    // User clicks a tool row to expand detail
    const toolRow = container.querySelector('[data-testid="tool-row-u1"]') as HTMLElement | null;
    act(() => {
      toolRow?.click();
    });
    expect(container.textContent).toContain('200 lines');

    // Status changes to done → should NOT auto-collapse (user interacted via tool row)
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 'u1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
            { id: 'r1', kind: 'tool_result', timestamp: 1001, label: 'Read', detail: '200 lines' },
          ],
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();
  });

  // ── P2-4: duration in summary ──
  it('shows duration in summary line', () => {
    const events: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Read' },
      { id: 'r1', kind: 'tool_result', timestamp: 1000 + 135_000, label: 'Read', detail: 'ok' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events,
          status: 'done',
        }),
      );
    });
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  // ── P2-5: visibility chip always shown ──
  it('shows "private" when thinkingMode is undefined', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          // thinkingMode not provided
        }),
      );
    });
    expect(container.textContent).toContain('private');
  });

  it('does not render a ppt card when no ppt file was generated', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();
  });

  it('renders a ppt attachment card from the generated local file path and opens that file', async () => {
    const pptEvents: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Bash python build_ppt.py' },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      },
      {
        id: 't3',
        kind: 'text',
        timestamp: 1002,
        content: 'PPT generated at C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('demo-deck.pptx');
    expect(container.textContent).toContain('生成时间：2026年3月24日');
    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspace/open-local', expect.objectContaining({ method: 'POST' }));
    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    const [, init] = openLocalCall ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
    });
  });

  it('joins relative ppt path with the configured project path before open-local', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: output\\demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'D:\\workspace\\thread-a',
        }),
      );
      await Promise.resolve();
    });

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\thread-a\\output\\demo-deck.pptx',
      projectPath: 'D:\\workspace\\thread-a',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\thread-a\\output\\demo-deck.pptx',
      projectPath: 'D:\\workspace\\thread-a',
    });
  });

  it('does not truncate relative output paths to a slash-prefixed suffix before open-local', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: 'output/20260402_192423_000/pages.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\ppts',
        }),
      );
      await Promise.resolve();
    });

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\ppts\\output\\20260402_192423_000\\pages.pptx',
      projectPath: 'D:\\opentiny\\ppts',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\ppts\\output\\20260402_192423_000\\pages.pptx',
      projectPath: 'D:\\opentiny\\ppts',
    });
  });

  it('joins relative ppt path with the default cwd when projectPath is default', async () => {
    const pptEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Bash python build_ppt.py',
        detail: '[Done] Saved: output/demo-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pptEvents,
          status: 'done',
          projectPath: 'default',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');

    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      projectPath: 'default',
    });

    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\demo-deck.pptx',
      projectPath: 'default',
    });
  });

  it('renders a markdown attachment card from the generated local file path and opens that file', async () => {
    const markdownEvents: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Write report.md' },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.md',
        detail: '[Done] Saved: C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\daily-report.md',
      },
      {
        id: 't3',
        kind: 'text',
        timestamp: 1002,
        content: 'Markdown generated at C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\daily-report.md',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="cli-output-markdown-card"]')).toBeTruthy();
    expect(container.textContent).toContain('daily-report.md');
    const openButton = container.querySelector('[data-testid="cli-output-markdown-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\daily-report.md',
    });
  });

  it('renders a word attachment card for docx output and does not render a ppt card', async () => {
    const docxEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.docx',
        detail: '[Done] Saved: D:\\workspace\\output\\weekly-report.docx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: docxEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-word-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('weekly-report.docx');
    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();

    const openButton = container.querySelector('[data-testid="cli-output-word-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\output\\weekly-report.docx',
    });
  });

  it('renders an excel attachment card for xlsx output and does not render word or ppt cards', async () => {
    const xlsxEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.xlsx',
        detail: '[Done] Saved: D:\\workspace\\output\\weekly-report.xlsx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: xlsxEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-excel-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('weekly-report.xlsx');
    expect(container.querySelector('[data-testid="cli-output-word-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();

    const openButton = container.querySelector('[data-testid="cli-output-excel-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\output\\weekly-report.xlsx',
    });
  });

  it('renders a pdf attachment card and opens the generated file', async () => {
    const pdfEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.pdf',
        detail: '[Done] Saved: D:\\workspace\\output\\weekly-report.pdf',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pdfEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-pdf-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('weekly-report.pdf');
    expect(container.querySelector('[data-testid="cli-output-word-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();

    const openButton = container.querySelector('[data-testid="cli-output-pdf-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\workspace\\output\\weekly-report.pdf',
    });
  });

  it('hides cover.pdf when a later final pdf is generated in the same cli output', async () => {
    const pdfEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write cover.pdf',
        detail: '[Done] Saved: D:\\workspace\\output\\cover.pdf',
      },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1002,
        label: 'Write final pdf',
        detail: '[Done] Saved: D:\\workspace\\output\\weekly-report.pdf',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: pdfEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    const cards = container.querySelectorAll('[data-testid="cli-output-pdf-card"]');
    expect(cards).toHaveLength(1);
    expect(container.textContent).toContain('weekly-report.pdf');
    expect(container.textContent).not.toContain('cover.pdf');
  });

  it('renders a txt attachment card for txt output and opens the resolved file', async () => {
    const txtEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write notes.txt',
        detail: '[Done] Saved: workspace/output/notes.txt',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: txtEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-txt-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('notes.txt');

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\notes.txt',
      projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
    });

    const openButton = container.querySelector('[data-testid="cli-output-txt-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\notes.txt',
      projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
    });
  });

  it('dedupes excel cards when the same file appears in both absolute and relative paths', async () => {
    const duplicateExcelEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.xlsx',
        detail:
          '[Done] Saved: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\weekly-report.xlsx',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content:
          'Excel generated at workspace/output/weekly-report.xlsx\nFinal file: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\weekly-report.xlsx',
      },
      {
        id: 't3',
        kind: 'tool_result',
        timestamp: 1003,
        label: 'Export spreadsheet',
        detail: 'Saved copy to workspace/output/weekly-report.xlsx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicateExcelEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-excel-card"]')).toHaveLength(1);
  });

  it('dedupes txt cards when the same file appears in both absolute and relative paths', async () => {
    const duplicateTxtEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write notes.txt',
        detail: '[Done] Saved: workspace/output/notes.txt',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content:
          'TXT generated at D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\notes.txt\nBackup reference: workspace/output/notes.txt',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicateTxtEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-txt-card"]')).toHaveLength(1);
  });

  it('dedupes txt cards when the same file appears with escaped and unescaped windows separators', async () => {
    const duplicateEscapedTxtEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write notes.txt',
        detail: '[Done] Saved: D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\notes.txt',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content: 'Final file: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\notes.txt',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicateEscapedTxtEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-txt-card"]')).toHaveLength(1);
  });

  it('dedupes excel cards when the same file appears with escaped and unescaped windows separators', async () => {
    const duplicateEscapedExcelEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.xlsx',
        detail:
          '[Done] Saved: D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\weekly-report.xlsx',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content: 'Final file: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\weekly-report.xlsx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicateEscapedExcelEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-excel-card"]')).toHaveLength(1);
  });

  it('dedupes txt cards when the same file appears as double-escaped and canonical windows paths', async () => {
    const duplicateEscapedTxtEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write 企业数字化升级解决方案.txt',
        detail:
          '[Done] Saved: D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\企业数字化升级解决方案.txt',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content: 'Final file: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\企业数字化升级解决方案.txt',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicateEscapedTxtEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-txt-card"]')).toHaveLength(1);
  });

  it('renders a markdown attachment card when the path is only present in escaped tool input json', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_use',
        timestamp: 1000,
        label: 'office → file_write',
        detail:
          '{"file_path":"D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\output\\\\20260414_105503_000\\\\outline.md","content":"# Outline"}',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('outline.md');

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(metaCall).toBeTruthy();
    expect(JSON.parse(String(metaCall?.[1]?.body)).path).toBe(
      'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
    );
  });

  it('renders a markdown attachment card when the path is embedded in an escaped shell command detail', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_use',
        timestamp: 1000,
        label: 'office → shell_command',
        detail:
          '{"command":"powershell -Command \\"Set-Content -Path \'D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\output\\\\20260414_105503_000\\\\outline.md\' -Value @\'hello\'@\\""}',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('outline.md');

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(metaCall).toBeTruthy();
    expect(JSON.parse(String(metaCall?.[1]?.body)).path).toBe(
      'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
    );
  });

  it('strips a leading 文件路径 label before resolving an absolute markdown path', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 'r1',
        kind: 'tool_result',
        timestamp: 1000,
        label: 'office ← result',
        detail:
          '文件路径：D:\\\\opentiny\\\\clowder-ai-gitcode\\\\relay-claw-main\\\\workspace\\\\产品迭代项目推进会会议纪要.md',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('产品迭代项目推进会会议纪要.md');

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(metaCall).toBeTruthy();
    expect(JSON.parse(String(metaCall?.[1]?.body)).path).toBe(
      'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\产品迭代项目推进会会议纪要.md',
    );
  });

  it('joins relative markdown path with the configured project path before open-local', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write outline.md',
        detail: '[Done] Saved: workspace/output/20260414_105503_000/outline.md',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).toBeTruthy();

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
      projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
    });

    const openButton = container.querySelector('[data-testid="cli-output-markdown-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
      projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
    });
  });

  it('joins relative markdown path with the default cwd when projectPath is default', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write outline.md',
        detail: '[Done] Saved: output/daily-report.md',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
          projectPath: 'default',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).toBeTruthy();

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\daily-report.md',
      projectPath: 'default',
    });

    const openButton = container.querySelector('[data-testid="cli-output-markdown-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\daily-report.md',
      projectPath: 'default',
    });
  });

  it('renders a word attachment card from the generated local file path and opens that file', async () => {
    const wordEvents: CliEvent[] = [
      { id: 't1', kind: 'tool_use', timestamp: 1000, label: 'Write report.docx' },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.docx',
        detail: '[Done] Saved: C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\weekly-report.docx',
      },
      {
        id: 't3',
        kind: 'text',
        timestamp: 1002,
        content: 'Word generated at C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\weekly-report.docx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: wordEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="cli-output-word-card"]')).toBeTruthy();
    expect(container.textContent).toContain('weekly-report.docx');
    const openButton = container.querySelector('[data-testid="cli-output-word-open"]') as HTMLButtonElement | null;
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\output\\weekly-report.docx',
    });
  });

  it('joins relative word path with the configured POSIX project path before open-local', async () => {
    const wordEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write report.docx',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/report.docx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: wordEvents,
          status: 'done',
          projectPath: '/Users/kagol/project',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-word-card"]');
    expect(card).toBeTruthy();

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: '/Users/kagol/project/workspace/output/20260415_100534_000/report.docx',
      projectPath: '/Users/kagol/project',
    });

    const openButton = container.querySelector('[data-testid="cli-output-word-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: '/Users/kagol/project/workspace/output/20260415_100534_000/report.docx',
      projectPath: '/Users/kagol/project',
    });
  });

  it('renders a word attachment card when only the filename is mentioned and projectPath is default', async () => {
    const wordEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Create word document',
        detail: '[Done] Generated Word document: weekly-report.docx',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content: 'Word文档已生成，文件名为 weekly-report.docx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: wordEvents,
          status: 'done',
          projectPath: 'default',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');

    const card = container.querySelector('[data-testid="cli-output-word-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('weekly-report.docx');

    const metaCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/local-file-meta');
    expect(JSON.parse(String(metaCall?.[1]?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\weekly-report.docx',
      projectPath: 'default',
    });
  });

  it('prefers a ppt attachment card over markdown when both markdown and ppt files are generated', async () => {
    const mixedEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write outline.md',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/outline.md',
      },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1002,
        label: 'Create slides',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/final-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: mixedEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cli-output-markdown-card"]')).toBeNull();
    expect(container.textContent).toContain('final-deck.pptx');
  });

  it('renders both word and ppt attachment cards when markdown, word, and ppt files are all generated', async () => {
    const mixedEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write outline.md',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/outline.md',
      },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1002,
        label: 'Create word',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/report.docx',
      },
      {
        id: 't3',
        kind: 'tool_result',
        timestamp: 1003,
        label: 'Create slides',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/final-deck.pptx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: mixedEvents,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="cli-output-word-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cli-output-markdown-card"]')).toBeNull();
    expect(container.textContent).toContain('report.docx');
    expect(container.textContent).toContain('final-deck.pptx');
  });

  it('renders only a word card when a Word file is mentioned through both word and generic document signals', async () => {
    const duplicatedWordSignals: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Create word',
        detail: '[Done] Saved: workspace/output/20260415_100534_000/report.docx',
      },
      {
        id: 't2',
        kind: 'text',
        timestamp: 1002,
        content: 'Final document path: workspace/output/20260415_100534_000/report.docx',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: duplicatedWordSignals,
          status: 'done',
          projectPath: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main',
        }),
      );
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[data-testid="cli-output-word-card"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="cli-output-ppt-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="cli-output-file-card"]')).toBeNull();
  });

  it('prefers the user-facing markdown artifact over internal memory markdown files', async () => {
    const markdownEvents: CliEvent[] = [
      {
        id: 't1',
        kind: 'tool_result',
        timestamp: 1001,
        label: 'Write outline',
        detail: '[Done] Saved: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
      },
      {
        id: 't2',
        kind: 'tool_result',
        timestamp: 1002,
        label: 'Write memory',
        detail: '[Done] Saved: C:\\Users\\kagol\\.jiuwenclaw\\agent\\memory\\2026-04-14.md',
      },
      {
        id: 't3',
        kind: 'text',
        timestamp: 1003,
        content:
          'User doc: D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md\nInternal memory: C:\\Users\\kagol\\.jiuwenclaw\\agent\\memory\\2026-04-14.md',
      },
    ];

    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: markdownEvents,
          status: 'done',
        }),
      );
      await Promise.resolve();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]') as HTMLDivElement | null;
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('outline.md');
    expect(card?.textContent).not.toContain('2026-04-14.md');

    const openButton = container.querySelector('[data-testid="cli-output-markdown-open"]') as HTMLButtonElement | null;
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const openLocalCall = mockApiFetch.mock.calls.findLast(([path]) => path === '/api/workspace/open-local');
    expect(JSON.parse(String(openLocalCall?.[1]?.body))).toEqual({
      path: 'D:\\opentiny\\clowder-ai-gitcode\\relay-claw-main\\workspace\\output\\20260414_105503_000\\outline.md',
    });
  });

  it.skip('does not render a ppt card when no ppt file was generated', async () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
        }),
      );
    });

    expect(container.textContent).toContain('NVIDIA_GTC_2026_华为风.pptx');
    const openButton = container.querySelector('[data-testid="cli-output-ppt-open"]') as HTMLButtonElement | null;
    expect(openButton?.textContent).toContain('打开');

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspace/open-local', expect.objectContaining({ method: 'POST' }));
    const [, init] = mockApiFetch.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent\\NVIDIA_GTC_2026_华为风.pptx',
    });
  });
});

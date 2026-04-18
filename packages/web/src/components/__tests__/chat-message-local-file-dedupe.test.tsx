/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const contentBlocksSpy = vi.fn();
const richBlocksSpy = vi.fn();
const cliOutputBlockSpy = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useCoCreatorConfig', () => ({
  useCoCreatorConfig: () => ({
    name: 'ME',
    avatar: '',
    color: { primary: '#000000', secondary: '#ffffff' },
  }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      uiThinkingExpandedByDefault: false,
      threads: [{ id: 'thread-1', projectPath: 'D:\\repo\\workspace' }],
      currentThreadId: 'thread-1',
    }),
}));
vi.mock('@/components/CatAvatar', () => ({ CatAvatar: () => null }));
vi.mock('@/components/ConnectorBubble', () => ({ ConnectorBubble: () => null }));
vi.mock('@/components/DirectionPill', () => ({ DirectionPill: () => null }));
vi.mock('@/components/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('@/components/GovernanceBlockedCard', () => ({ GovernanceBlockedCard: () => null }));
vi.mock('@/components/IntentRecognitionPlaceholder', () => ({ IntentRecognitionPlaceholder: () => null }));
vi.mock('@/components/MarkdownContent', () => ({ MarkdownContent: () => null }));
vi.mock('@/components/MetadataBadge', () => ({ MetadataBadge: () => null }));
vi.mock('@/components/ReplyPill', () => ({ ReplyPill: () => null }));
vi.mock('@/components/SummaryCard', () => ({ SummaryCard: () => null }));
vi.mock('@/components/ThinkingContent', () => ({ ThinkingContent: () => null }));
vi.mock('@/components/TimeoutDiagnosticsPanel', () => ({ TimeoutDiagnosticsPanel: () => null }));
vi.mock('@/components/TtsPlayButton', () => ({ TtsPlayButton: () => null }));
vi.mock('@/components/ContentBlocks', () => ({
  ContentBlocks: (props: unknown) => {
    contentBlocksSpy(props);
    return React.createElement('div', { 'data-testid': 'content-blocks-stub' });
  },
}));
vi.mock('@/components/rich/RichBlocks', () => ({
  RichBlocks: (props: unknown) => {
    richBlocksSpy(props);
    return React.createElement('div', { 'data-testid': 'rich-blocks-stub' });
  },
}));
vi.mock('@/components/cli-output/CliOutputBlock', async () => {
  const actual = await vi.importActual<typeof import('@/components/cli-output/CliOutputBlock')>(
    '@/components/cli-output/CliOutputBlock',
  );
  return {
    ...actual,
    CliOutputBlock: (props: unknown) => {
      cliOutputBlockSpy(props);
      return React.createElement('div', { 'data-testid': 'cli-output-block-stub' });
    },
  };
});

describe('ChatMessage local file dedupe', () => {
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
    contentBlocksSpy.mockClear();
    richBlocksSpy.mockClear();
    cliOutputBlockSpy.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('filters duplicate workspace file attachments from content blocks when CLI output already shows the local document', async () => {
    const { ChatMessage } = await import('@/components/ChatMessage');

    const message = {
      id: 'msg-local-dedupe-1',
      type: 'assistant',
      catId: 'codex',
      timestamp: Date.now(),
      deliveredAt: undefined,
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'callback',
      variant: null,
      isStreaming: false,
      content: '已生成文件',
      thinking: '',
      contentBlocks: [
        { type: 'text', text: '正文说明' },
        {
          type: 'file',
          url: '/api/workspace/download?worktreeId=wt-1&path=workspace%2Foutput%2Fdemo.xlsx',
          fileName: 'demo.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          type: 'file',
          url: '/uploads/keep.xlsx',
          fileName: 'keep.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
      toolEvents: [
        { id: 'tool-1', type: 'tool_use', label: 'Write report', timestamp: 1000 },
        {
          id: 'tool-2',
          type: 'tool_result',
          label: 'codex ← result',
          detail: 'Saved file: workspace/output/demo.xlsx',
          timestamp: 1001,
        },
      ],
      metadata: null,
      summary: null,
      evidence: null,
      extra: null,
      source: null,
    } as const;

    act(() => {
      root.render(React.createElement(ChatMessage, { message: message as never, getCatById: (() => undefined) as never }));
    });

    const props = contentBlocksSpy.mock.calls.at(-1)?.[0] as { blocks: Array<{ type: string; fileName?: string }> };
    expect(props.blocks).toEqual([
      { type: 'text', text: '正文说明' },
      {
        type: 'file',
        url: '/uploads/keep.xlsx',
        fileName: 'keep.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);
  });

  it('filters duplicate workspace rich file blocks when CLI output already shows the local document', async () => {
    const { ChatMessage } = await import('@/components/ChatMessage');

    const message = {
      id: 'msg-local-dedupe-2',
      type: 'assistant',
      catId: 'codex',
      timestamp: Date.now(),
      deliveredAt: undefined,
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'callback',
      variant: null,
      isStreaming: false,
      content: '已生成文件',
      thinking: '',
      contentBlocks: [],
      toolEvents: [
        { id: 'tool-1', type: 'tool_use', label: 'Write notes', timestamp: 1000 },
        {
          id: 'tool-2',
          type: 'tool_result',
          label: 'codex ← result',
          detail: 'Saved file: workspace/output/demo.txt',
          timestamp: 1001,
        },
      ],
      metadata: null,
      summary: null,
      evidence: null,
      extra: {
        rich: {
          v: 1,
          blocks: [
            {
              id: 'card-1',
              kind: 'card',
              v: 1,
              title: '说明',
            },
            {
              id: 'file-1',
              kind: 'file',
              v: 1,
              fileName: 'demo.txt',
              url: '/api/workspace/download?worktreeId=wt-1&path=workspace%2Foutput%2Fdemo.txt',
              workspacePath: 'workspace/output/demo.txt',
              worktreeId: 'wt-1',
            },
            {
              id: 'file-2',
              kind: 'file',
              v: 1,
              fileName: 'keep.txt',
              url: '/uploads/keep.txt',
            },
          ],
        },
      },
      source: null,
    } as const;

    act(() => {
      root.render(React.createElement(ChatMessage, { message: message as never, getCatById: (() => undefined) as never }));
    });

    const props = richBlocksSpy.mock.calls.at(-1)?.[0] as { blocks: Array<{ id: string }> };
    expect(props.blocks).toEqual([
      {
        id: 'card-1',
        kind: 'card',
        v: 1,
        title: '说明',
      },
      {
        id: 'file-2',
        kind: 'file',
        v: 1,
        fileName: 'keep.txt',
        url: '/uploads/keep.txt',
      },
    ]);
  });

  it('filters duplicate uploaded file attachments when CLI output already shows the same generated document', async () => {
    const { ChatMessage } = await import('@/components/ChatMessage');

    const message = {
      id: 'msg-local-dedupe-3',
      type: 'assistant',
      catId: 'codex',
      timestamp: Date.now(),
      deliveredAt: undefined,
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'callback',
      variant: null,
      isStreaming: false,
      content: '已生成文件',
      thinking: '',
      contentBlocks: [
        {
          type: 'file',
          url: '/uploads/demo.xlsx',
          fileName: 'demo.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        {
          type: 'file',
          url: '/uploads/keep.xlsx',
          fileName: 'keep.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
      toolEvents: [
        { id: 'tool-1', type: 'tool_use', label: 'Write report', timestamp: 1000 },
        {
          id: 'tool-2',
          type: 'tool_result',
          label: 'codex ← result',
          detail: 'Saved file: workspace/output/demo.xlsx',
          timestamp: 1001,
        },
      ],
      metadata: null,
      summary: null,
      evidence: null,
      extra: {
        rich: {
          v: 1,
          blocks: [
            {
              id: 'file-1',
              kind: 'file',
              v: 1,
              fileName: 'demo.xlsx',
              url: '/uploads/demo.xlsx',
            },
            {
              id: 'file-2',
              kind: 'file',
              v: 1,
              fileName: 'keep.xlsx',
              url: '/uploads/keep.xlsx',
            },
          ],
        },
      },
      source: null,
    } as const;

    act(() => {
      root.render(React.createElement(ChatMessage, { message: message as never, getCatById: (() => undefined) as never }));
    });

    const contentProps = contentBlocksSpy.mock.calls.at(-1)?.[0] as { blocks: Array<{ fileName?: string }> };
    expect(contentProps.blocks).toEqual([
      {
        type: 'file',
        url: '/uploads/keep.xlsx',
        fileName: 'keep.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);

    const richProps = richBlocksSpy.mock.calls.at(-1)?.[0] as { blocks: Array<{ id: string }> };
    expect(richProps.blocks).toEqual([
      {
        id: 'file-2',
        kind: 'file',
        v: 1,
        fileName: 'keep.xlsx',
        url: '/uploads/keep.xlsx',
      },
    ]);
  });

  it('passes suppressed generated file names down to CLI output and attachment filtering', async () => {
    const { ChatMessage } = await import('@/components/ChatMessage');

    const message = {
      id: 'msg-local-dedupe-4',
      type: 'assistant',
      catId: 'codex',
      timestamp: Date.now(),
      deliveredAt: undefined,
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'stream',
      variant: null,
      isStreaming: false,
      content: '最终输出在 workspace/output/demo.xlsx',
      thinking: '',
      contentBlocks: [
        {
          type: 'file',
          url: '/uploads/demo.xlsx',
          fileName: 'demo.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
      toolEvents: [{ id: 'tool-1', type: 'tool_use', label: 'Write report', timestamp: 1000 }],
      metadata: null,
      summary: null,
      evidence: null,
      extra: null,
      source: null,
    } as const;

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: message as never,
          getCatById: (() => undefined) as never,
          suppressedGeneratedFileNames: ['demo.xlsx'],
        }),
      );
    });

    const cliProps = cliOutputBlockSpy.mock.calls.at(-1)?.[0] as { suppressedGeneratedFileNames?: string[] };
    expect(cliProps.suppressedGeneratedFileNames).toEqual(['demo.xlsx']);

    const contentProps = contentBlocksSpy.mock.calls.at(-1)?.[0] as { blocks: Array<{ fileName?: string }> } | undefined;
    expect(contentProps?.blocks ?? []).toEqual([]);
  });
});

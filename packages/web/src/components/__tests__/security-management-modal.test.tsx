import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityManagementModal from '../SecurityManagementModal';

const mocks = vi.hoisted(() => ({
  configGet: vi.fn(),
  configSet: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('@/utils/jiuwen-agent-ws-client', () => ({
  JiuwenAgentWsClient: vi.fn(function JiuwenAgentWsClient() {
    return {
      configGet: mocks.configGet,
      configSet: mocks.configSet,
      disconnect: mocks.disconnect,
    };
  }),
}));

describe('SecurityManagementModal', () => {
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
    mocks.configGet.mockReset();
    mocks.configSet.mockReset();
    mocks.disconnect.mockReset();
    mocks.configGet.mockResolvedValue({
      request_id: 'req-1',
      channel_id: 'web',
      ok: true,
      payload: {
        trees: {
          permissions: {
            enabled: true,
            tools: {
              mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
              write_memory: 'allow',
            },
          },
        },
      },
    });
    mocks.configSet.mockResolvedValue({
      request_id: 'req-2',
      channel_id: 'web',
      ok: true,
      payload: {
        yaml_written: true,
        reloaded: true,
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('loads permissions config when the modal opens', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    expect(mocks.configGet).toHaveBeenCalledWith(['permissions']);
    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;
    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('mcp_exec_command');
    expect(container.textContent).toContain('write_memory');
  });

  it('treats missing permissions.enabled as enabled when loading jiuwen config', async () => {
    mocks.configGet.mockResolvedValueOnce({
      request_id: 'req-1',
      channel_id: 'web',
      ok: true,
      payload: {
        trees: {
          permissions: {
            tools: {
              mcp_exec_command: { '*': 'ask' },
            },
          },
        },
      },
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('saves approval guard changes back to jiuwen', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
    });

    expect(mocks.configSet).toHaveBeenCalledWith({
      permissions: {
        enabled: false,
      },
    });
    expect(pageToggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('saves tool policy toggles as ask or allow and preserves patterns', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      await Promise.resolve();
    });

    expect(mocks.configSet).toHaveBeenCalledWith({
      permissions: {
        tools: {
          mcp_exec_command: {
            '*': 'allow',
            patterns: {
              'git status *': 'allow',
            },
          },
        },
      },
    });
    expect(commandToggle?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      memoryToggle?.click();
      await Promise.resolve();
    });

    expect(mocks.configSet).toHaveBeenLastCalledWith({
      permissions: {
        tools: {
          write_memory: 'ask',
        },
      },
    });
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('reverts optimistic changes when save fails', async () => {
    mocks.configSet.mockResolvedValueOnce({
      request_id: 'req-3',
      channel_id: 'web',
      ok: false,
      payload: {
        error: 'save failed',
      },
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('save failed');
  });

  it('keeps later successful tool toggles when an earlier save fails', async () => {
    const firstSave = createDeferred<{
      request_id: string;
      channel_id: string;
      ok: boolean;
      payload: { error?: string; yaml_written?: boolean; reloaded?: boolean };
    }>();
    const secondSave = createDeferred<{
      request_id: string;
      channel_id: string;
      ok: boolean;
      payload: { error?: string; yaml_written?: boolean; reloaded?: boolean };
    }>();

    mocks.configSet
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      memoryToggle?.click();
      await Promise.resolve();
    });

    secondSave.resolve({
      request_id: 'req-2b',
      channel_id: 'web',
      ok: true,
      payload: {
        yaml_written: true,
        reloaded: true,
      },
    });
    await flush();

    firstSave.resolve({
      request_id: 'req-2a',
      channel_id: 'web',
      ok: false,
      payload: {
        error: 'first save failed',
      },
    });
    await flush();

    expect(commandToggle?.getAttribute('aria-checked')).toBe('true');
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('first save failed');
  });

  it('disconnects the websocket client when the modal closes', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: false, onClose: vi.fn() }));
      await Promise.resolve();
    });

    expect(mocks.disconnect).toHaveBeenCalled();
  });
});
